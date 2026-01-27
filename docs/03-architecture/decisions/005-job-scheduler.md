# ADR-005: Job Scheduler

## Status

Accepted

## Context

Jack The Butler requires scheduled job execution for:

1. **Proactive notifications** - Time-based guest messaging
   - 3 days before arrival: Welcome message
   - 2 hours post check-in: Settling-in check
   - Day before checkout: Checkout reminder
   - 24 hours post-checkout: Thank you + feedback request

2. **No-show handling** - Timed escalation sequence
   - ETA + 2 hours: First outreach
   - ETA + 4 hours: Second outreach
   - 11 PM: Staff alert
   - Midnight: Auto-process

3. **SLA monitoring** - Task deadline tracking
   - Response SLA warnings at 80%
   - Resolution SLA breach detection
   - Escalation timers

4. **Data synchronization** - Periodic tasks
   - PMS sync every 5 minutes
   - Review platform monitoring every hour
   - Report generation daily

5. **Cleanup jobs** - Maintenance
   - Rate limit entry cleanup
   - Session expiration
   - Log rotation

### Constraints

- **Self-hosted**: No external services (Redis, RabbitMQ)
- **Single container**: Must work with SQLite only
- **Persistence**: Jobs survive server restart
- **Scalability**: Handle 1000+ scheduled jobs per hotel
- **Reliability**: No duplicate execution, handle failures gracefully

### Requirements

- Schedule jobs for specific times (delayed jobs)
- Schedule recurring jobs (cron patterns)
- Persist jobs to survive restarts
- Prevent duplicate execution
- Retry failed jobs with backoff
- Cancel/modify scheduled jobs
- Monitor job health and failures

## Decision

Implement a **custom SQLite-backed job scheduler** with the following architecture:

1. **SQLite persistence** - Jobs stored in `scheduled_jobs` table
2. **Polling-based execution** - Check for due jobs every second
3. **Atomic job claiming** - Prevent duplicate execution via row locking
4. **Cron support** - Parse cron expressions for recurring jobs
5. **Dead letter queue** - Failed jobs moved to DLQ after max retries

### Why Not Existing Libraries?

| Library | Issue |
|---------|-------|
| Bull/BullMQ | Requires Redis |
| Agenda | Requires MongoDB |
| Bee-Queue | Requires Redis |
| node-cron | No persistence, in-memory only |
| Bree | File-based, not SQLite compatible |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           JOB SCHEDULER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │  Job Producers  │    │   Job Store     │    │  Job Consumers  │     │
│  │                 │    │   (SQLite)      │    │                 │     │
│  │ • Automation    │───▶│                 │───▶│ • Worker Pool   │     │
│  │ • PMS Sync      │    │ scheduled_jobs  │    │ • Retry Handler │     │
│  │ • SLA Monitor   │    │                 │    │ • DLQ Handler   │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                │                        │               │
│                                │                        │               │
│                                ▼                        ▼               │
│                         ┌─────────────────┐    ┌─────────────────┐     │
│                         │  Cron Manager   │    │  Job Handlers   │     │
│                         │                 │    │                 │     │
│                         │ • Parse cron    │    │ • Notification  │     │
│                         │ • Schedule next │    │ • PMS Sync      │     │
│                         │ • Recurring     │    │ • SLA Check     │     │
│                         └─────────────────┘    └─────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Implementation

### Database Schema

Already defined in `04-specs/database/schema.ts`:

```typescript
export const scheduledJobs = sqliteTable('scheduled_jobs', {
  id: text('id').primaryKey(),

  // Job definition
  type: text('type').notNull(),           // Job handler type
  payload: text('payload').notNull(),     // JSON payload

  // Scheduling
  scheduledFor: text('scheduled_for').notNull(),  // ISO datetime
  cronExpression: text('cron_expression'),        // For recurring jobs

  // Tracking
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastAttemptAt: text('last_attempt_at'),
  nextRetryAt: text('next_retry_at'),

  // Execution
  lockedBy: text('locked_by'),            // Worker ID that claimed job
  lockedAt: text('locked_at'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),

  // Results
  result: text('result'),                 // JSON success result
  error: text('error'),                   // Error message if failed

  // Reference
  automationRuleId: text('automation_rule_id'),
  targetType: text('target_type'),        // guest, reservation, task
  targetId: text('target_id'),

  // Deduplication
  dedupeKey: text('dedupe_key'),          // Unique key to prevent duplicates

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

### Job Status Flow

```
┌─────────┐     claim      ┌─────────┐    success    ┌───────────┐
│ pending │ ─────────────▶ │ running │ ────────────▶ │ completed │
└─────────┘                └─────────┘               └───────────┘
     │                          │
     │                          │ failure
     │                          ▼
     │                    ┌─────────┐   max retries   ┌────────┐
     │                    │ failed  │ ──────────────▶ │  dlq   │
     │                    └─────────┘                 └────────┘
     │                          │
     │                          │ retry scheduled
     │                          ▼
     └──────────────────── pending (with nextRetryAt)
```

### Core Interfaces

```typescript
// =============================================================================
// JOB DEFINITIONS
// =============================================================================

interface JobDefinition<T = unknown> {
  /** Unique job type identifier */
  type: string;

  /** Job payload */
  payload: T;

  /** When to run (ISO datetime or Date) */
  scheduledFor: Date | string;

  /** Cron expression for recurring jobs */
  cronExpression?: string;

  /** Maximum retry attempts */
  maxAttempts?: number;

  /** Reference to related entity */
  target?: {
    type: 'guest' | 'reservation' | 'conversation' | 'task';
    id: string;
  };

  /** Deduplication key (prevents duplicate scheduling) */
  dedupeKey?: string;

  /** Linked automation rule */
  automationRuleId?: string;
}

interface Job<T = unknown> extends JobDefinition<T> {
  id: string;
  status: JobStatus;
  attempts: number;
  createdAt: Date;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
}

type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dlq' | 'cancelled';

// =============================================================================
// JOB HANDLERS
// =============================================================================

interface JobHandler<T = unknown> {
  /** Job type this handler processes */
  type: string;

  /** Execute the job */
  execute(job: Job<T>): Promise<JobResult>;

  /** Optional: Validate payload before scheduling */
  validate?(payload: T): boolean;

  /** Optional: Custom retry delay calculation */
  getRetryDelay?(attempt: number, error: Error): number;
}

interface JobResult {
  success: boolean;
  data?: unknown;
  error?: {
    message: string;
    code?: string;
    retryable?: boolean;
  };
}

// =============================================================================
// SCHEDULER SERVICE
// =============================================================================

interface Scheduler {
  /** Schedule a one-time job */
  schedule<T>(job: JobDefinition<T>): Promise<string>;

  /** Schedule a recurring job */
  scheduleRecurring<T>(job: JobDefinition<T> & { cronExpression: string }): Promise<string>;

  /** Cancel a scheduled job */
  cancel(jobId: string): Promise<boolean>;

  /** Cancel jobs by dedupe key */
  cancelByDedupeKey(dedupeKey: string): Promise<number>;

  /** Get job status */
  getJob(jobId: string): Promise<Job | null>;

  /** List jobs by target */
  getJobsForTarget(targetType: string, targetId: string): Promise<Job[]>;

  /** Register a job handler */
  registerHandler<T>(handler: JobHandler<T>): void;

  /** Start the scheduler */
  start(): Promise<void>;

  /** Stop the scheduler */
  stop(): Promise<void>;
}
```

### Scheduler Implementation

```typescript
class SQLiteScheduler implements Scheduler {
  private handlers = new Map<string, JobHandler>();
  private workerId: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Configuration
  private config = {
    pollIntervalMs: 1000,           // Check for jobs every 1 second
    lockTimeoutMs: 300000,          // 5 minute lock timeout
    maxConcurrentJobs: 10,          // Max parallel jobs
    defaultMaxAttempts: 3,          // Default retry attempts
    defaultRetryDelayMs: 60000,     // 1 minute base retry delay
  };

  constructor(private db: Database) {
    this.workerId = `worker_${hostname()}_${process.pid}`;
  }

  async schedule<T>(definition: JobDefinition<T>): Promise<string> {
    const id = generateId('job');

    // Check deduplication
    if (definition.dedupeKey) {
      const existing = await this.findByDedupeKey(definition.dedupeKey);
      if (existing && existing.status === 'pending') {
        return existing.id;  // Return existing job instead
      }
    }

    await this.db.insert(scheduledJobs).values({
      id,
      type: definition.type,
      payload: JSON.stringify(definition.payload),
      scheduledFor: toISOString(definition.scheduledFor),
      cronExpression: definition.cronExpression,
      maxAttempts: definition.maxAttempts ?? this.config.defaultMaxAttempts,
      targetType: definition.target?.type,
      targetId: definition.target?.id,
      dedupeKey: definition.dedupeKey,
      automationRuleId: definition.automationRuleId,
      status: 'pending',
    });

    return id;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Recover stale locked jobs on startup
    await this.recoverStaleJobs();

    // Start polling loop
    this.pollInterval = setInterval(
      () => this.poll(),
      this.config.pollIntervalMs
    );

    console.log(`Scheduler started (worker: ${this.workerId})`);
  }

  private async poll(): Promise<void> {
    try {
      // Claim available jobs
      const jobs = await this.claimJobs(this.config.maxConcurrentJobs);

      // Execute claimed jobs in parallel
      await Promise.all(jobs.map(job => this.executeJob(job)));

    } catch (error) {
      console.error('Scheduler poll error:', error);
    }
  }

  private async claimJobs(limit: number): Promise<Job[]> {
    const now = new Date().toISOString();

    // Atomic claim using SQLite transaction
    return await this.db.transaction(async (tx) => {
      // Find due, unclaimed jobs
      const dueJobs = await tx
        .select()
        .from(scheduledJobs)
        .where(and(
          eq(scheduledJobs.status, 'pending'),
          lte(scheduledJobs.scheduledFor, now),
          or(
            isNull(scheduledJobs.nextRetryAt),
            lte(scheduledJobs.nextRetryAt, now)
          )
        ))
        .orderBy(asc(scheduledJobs.scheduledFor))
        .limit(limit);

      if (dueJobs.length === 0) return [];

      // Claim them atomically
      const jobIds = dueJobs.map(j => j.id);
      await tx
        .update(scheduledJobs)
        .set({
          status: 'running',
          lockedBy: this.workerId,
          lockedAt: now,
        })
        .where(inArray(scheduledJobs.id, jobIds));

      return dueJobs.map(this.mapToJob);
    });
  }

  private async executeJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);

    if (!handler) {
      await this.failJob(job, `No handler registered for job type: ${job.type}`, false);
      return;
    }

    const startedAt = new Date();

    try {
      await this.db
        .update(scheduledJobs)
        .set({ startedAt: startedAt.toISOString() })
        .where(eq(scheduledJobs.id, job.id));

      // Execute with timeout
      const result = await withTimeout(
        handler.execute(job),
        this.config.lockTimeoutMs,
        `Job ${job.id} timed out`
      );

      if (result.success) {
        await this.completeJob(job, result.data);

        // Schedule next occurrence if recurring
        if (job.cronExpression) {
          await this.scheduleNextOccurrence(job);
        }
      } else {
        const retryable = result.error?.retryable !== false;
        await this.failJob(job, result.error?.message || 'Unknown error', retryable);
      }

    } catch (error) {
      await this.failJob(job, error.message, true);
    }
  }

  private async failJob(job: Job, errorMessage: string, retryable: boolean): Promise<void> {
    const attempts = job.attempts + 1;
    const maxAttempts = job.maxAttempts ?? this.config.defaultMaxAttempts;

    if (retryable && attempts < maxAttempts) {
      // Schedule retry
      const handler = this.handlers.get(job.type);
      const delayMs = handler?.getRetryDelay?.(attempts, new Error(errorMessage))
        ?? this.calculateRetryDelay(attempts);

      const nextRetryAt = new Date(Date.now() + delayMs);

      await this.db
        .update(scheduledJobs)
        .set({
          status: 'pending',
          attempts,
          lastAttemptAt: new Date().toISOString(),
          nextRetryAt: nextRetryAt.toISOString(),
          error: errorMessage,
          lockedBy: null,
          lockedAt: null,
        })
        .where(eq(scheduledJobs.id, job.id));

      console.log(`Job ${job.id} failed, retry ${attempts}/${maxAttempts} at ${nextRetryAt}`);

    } else {
      // Move to DLQ
      await this.db
        .update(scheduledJobs)
        .set({
          status: 'dlq',
          attempts,
          lastAttemptAt: new Date().toISOString(),
          error: errorMessage,
          lockedBy: null,
          lockedAt: null,
        })
        .where(eq(scheduledJobs.id, job.id));

      // Alert operations
      await this.alertDLQ(job, errorMessage);

      console.error(`Job ${job.id} moved to DLQ after ${attempts} attempts: ${errorMessage}`);
    }
  }

  private async completeJob(job: Job, result: unknown): Promise<void> {
    await this.db
      .update(scheduledJobs)
      .set({
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: result ? JSON.stringify(result) : null,
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(scheduledJobs.id, job.id));
  }

  private async scheduleNextOccurrence(job: Job): Promise<void> {
    if (!job.cronExpression) return;

    const nextRun = parseNextCronDate(job.cronExpression);

    await this.schedule({
      type: job.type,
      payload: job.payload,
      scheduledFor: nextRun,
      cronExpression: job.cronExpression,
      maxAttempts: job.maxAttempts,
      target: job.target,
      automationRuleId: job.automationRuleId,
      // New dedupe key for next occurrence
      dedupeKey: job.dedupeKey ? `${job.dedupeKey}:${nextRun.toISOString()}` : undefined,
    });
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1min, 2min, 4min, 8min, ...
    const baseDelay = this.config.defaultRetryDelayMs;
    const exponential = baseDelay * Math.pow(2, attempt - 1);
    const maxDelay = 3600000;  // Cap at 1 hour
    const jitter = Math.random() * 0.2 * exponential;  // 0-20% jitter
    return Math.min(exponential + jitter, maxDelay);
  }

  private async recoverStaleJobs(): Promise<void> {
    const staleThreshold = new Date(Date.now() - this.config.lockTimeoutMs).toISOString();

    // Reset jobs locked by crashed workers
    const result = await this.db
      .update(scheduledJobs)
      .set({
        status: 'pending',
        lockedBy: null,
        lockedAt: null,
      })
      .where(and(
        eq(scheduledJobs.status, 'running'),
        lt(scheduledJobs.lockedAt, staleThreshold)
      ));

    if (result.changes > 0) {
      console.log(`Recovered ${result.changes} stale jobs`);
    }
  }
}
```

### Built-in Job Handlers

```typescript
// =============================================================================
// PROACTIVE NOTIFICATION HANDLER
// =============================================================================

const proactiveNotificationHandler: JobHandler<ProactiveNotificationPayload> = {
  type: 'proactive_notification',

  async execute(job) {
    const { guestId, templateId, channel, context } = job.payload;

    // Check timing rules
    const guest = await getGuest(guestId);
    const timing = shouldSendProactive(guest, await getActiveConversation(guestId));

    if (!timing.canSend) {
      if (timing.nextAttempt) {
        // Reschedule for better time
        return {
          success: false,
          error: {
            message: `Deferred: ${timing.reason}`,
            retryable: true,
          },
        };
      }
      // Skip entirely
      return { success: true, data: { skipped: true, reason: timing.reason } };
    }

    // Send notification
    const result = await sendTemplatedMessage(guest, templateId, channel, context);

    return {
      success: result.delivered,
      data: { messageId: result.messageId },
      error: result.error ? { message: result.error, retryable: true } : undefined,
    };
  },

  getRetryDelay(attempt, error) {
    // For quiet hours, delay until morning
    if (error.message.includes('quiet_hours')) {
      return getMillisecondsUntil8AM();
    }
    // Default exponential backoff
    return 60000 * Math.pow(2, attempt - 1);
  },
};

interface ProactiveNotificationPayload {
  guestId: string;
  templateId: string;
  channel: 'whatsapp' | 'sms' | 'email';
  context: Record<string, unknown>;
}

// =============================================================================
// NO-SHOW CHECK HANDLER
// =============================================================================

const noShowCheckHandler: JobHandler<NoShowCheckPayload> = {
  type: 'no_show_check',

  async execute(job) {
    const { reservationId, stage } = job.payload;

    const reservation = await getReservation(reservationId);

    // Already checked in - nothing to do
    if (reservation.status === 'checked_in') {
      return { success: true, data: { action: 'none', reason: 'checked_in' } };
    }

    switch (stage) {
      case 'first_outreach':
        await sendNoShowOutreach(reservation, 1);
        await scheduleNoShowCheck(reservationId, 'second_outreach', hours(4));
        break;

      case 'second_outreach':
        await sendNoShowOutreach(reservation, 2);
        await scheduleNoShowCheck(reservationId, 'staff_alert', untilHour(23));
        break;

      case 'staff_alert':
        await alertStaffNoShow(reservation);
        await scheduleNoShowCheck(reservationId, 'process', untilMidnight());
        break;

      case 'process':
        await processNoShow(reservation);
        break;
    }

    return { success: true, data: { stage, reservationId } };
  },
};

interface NoShowCheckPayload {
  reservationId: string;
  stage: 'first_outreach' | 'second_outreach' | 'staff_alert' | 'process';
}

// =============================================================================
// PMS SYNC HANDLER
// =============================================================================

const pmsSyncHandler: JobHandler<PMSSyncPayload> = {
  type: 'pms_sync',

  async execute(job) {
    const { syncType } = job.payload;

    switch (syncType) {
      case 'arrivals':
        await syncArrivals();
        break;
      case 'departures':
        await syncDepartures();
        break;
      case 'in_house':
        await syncInHouseGuests();
        break;
      case 'room_status':
        await syncRoomStatuses();
        break;
    }

    return { success: true, data: { syncType, syncedAt: new Date() } };
  },
};

interface PMSSyncPayload {
  syncType: 'arrivals' | 'departures' | 'in_house' | 'room_status';
}

// =============================================================================
// SLA CHECK HANDLER
// =============================================================================

const slaCheckHandler: JobHandler<SLACheckPayload> = {
  type: 'sla_check',

  async execute(job) {
    const { taskId, checkType } = job.payload;

    const task = await getTask(taskId);

    if (task.status === 'completed' || task.status === 'cancelled') {
      return { success: true, data: { action: 'none', reason: 'task_resolved' } };
    }

    switch (checkType) {
      case 'response_warning':
        await sendSLAWarning(task, 'response');
        break;
      case 'response_breach':
        await handleSLABreach(task, 'response');
        break;
      case 'resolution_warning':
        await sendSLAWarning(task, 'resolution');
        break;
      case 'resolution_breach':
        await handleSLABreach(task, 'resolution');
        break;
    }

    return { success: true, data: { taskId, checkType } };
  },
};

interface SLACheckPayload {
  taskId: string;
  checkType: 'response_warning' | 'response_breach' | 'resolution_warning' | 'resolution_breach';
}
```

### Cron Expression Support

```typescript
import { parseExpression } from 'cron-parser';

function parseNextCronDate(cronExpression: string, after: Date = new Date()): Date {
  const interval = parseExpression(cronExpression, {
    currentDate: after,
    tz: process.env.TZ || 'UTC',
  });
  return interval.next().toDate();
}

// Register recurring jobs on startup
async function registerRecurringJobs(scheduler: Scheduler): Promise<void> {
  // PMS sync every 5 minutes
  await scheduler.scheduleRecurring({
    type: 'pms_sync',
    payload: { syncType: 'arrivals' },
    scheduledFor: new Date(),
    cronExpression: '*/5 * * * *',
    dedupeKey: 'pms_sync_arrivals',
  });

  await scheduler.scheduleRecurring({
    type: 'pms_sync',
    payload: { syncType: 'departures' },
    scheduledFor: new Date(),
    cronExpression: '*/5 * * * *',
    dedupeKey: 'pms_sync_departures',
  });

  // Review monitoring every hour
  await scheduler.scheduleRecurring({
    type: 'review_monitor',
    payload: {},
    scheduledFor: new Date(),
    cronExpression: '0 * * * *',
    dedupeKey: 'review_monitor',
  });

  // Cleanup jobs daily at 3 AM
  await scheduler.scheduleRecurring({
    type: 'cleanup',
    payload: { cleanupType: 'rate_limits' },
    scheduledFor: new Date(),
    cronExpression: '0 3 * * *',
    dedupeKey: 'cleanup_rate_limits',
  });
}
```

### Job Deduplication

```typescript
// Dedupe key patterns for common jobs
const DEDUPE_PATTERNS = {
  // One pre-arrival message per reservation
  preArrival: (resId: string) => `proactive:pre_arrival:${resId}`,

  // One settling-in check per stay
  settlingIn: (resId: string) => `proactive:settling_in:${resId}`,

  // One no-show sequence per reservation
  noShow: (resId: string, stage: string) => `no_show:${stage}:${resId}`,

  // One SLA check per task per type
  slaCheck: (taskId: string, type: string) => `sla:${type}:${taskId}`,
};

// Schedule proactive with deduplication
async function schedulePreArrivalMessage(reservation: Reservation): Promise<void> {
  const scheduledFor = subDays(parseISO(reservation.arrivalDate), 3);

  await scheduler.schedule({
    type: 'proactive_notification',
    payload: {
      guestId: reservation.guestId,
      templateId: 'pre_arrival_welcome',
      channel: 'whatsapp',
      context: { reservation },
    },
    scheduledFor,
    target: { type: 'reservation', id: reservation.id },
    dedupeKey: DEDUPE_PATTERNS.preArrival(reservation.id),
  });
}
```

### Monitoring & Observability

```typescript
interface SchedulerMetrics {
  jobsScheduled: Counter;
  jobsExecuted: Counter;
  jobsSucceeded: Counter;
  jobsFailed: Counter;
  jobsRetried: Counter;
  jobsInDLQ: Counter;
  jobExecutionDuration: Histogram;
  queueDepth: Gauge;
  oldestPendingJob: Gauge;
}

// Health check endpoint
app.get('/health/scheduler', async (req, res) => {
  const stats = await getSchedulerStats();

  const healthy =
    stats.queueDepth < 1000 &&
    stats.dlqSize < 50 &&
    stats.oldestPendingMinutes < 60;

  res.status(healthy ? 200 : 503).json({
    healthy,
    stats: {
      queueDepth: stats.queueDepth,
      dlqSize: stats.dlqSize,
      jobsLast24h: stats.completedLast24h,
      failureRate: stats.failureRate,
      oldestPendingMinutes: stats.oldestPendingMinutes,
    },
  });
});
```

## Consequences

### Positive

- **No external dependencies**: Works with SQLite only
- **Persistence**: Jobs survive restarts
- **Atomic execution**: SQLite transactions prevent duplicates
- **Flexible**: Supports one-time and recurring jobs
- **Observable**: Built-in metrics and health checks
- **Recoverable**: Automatic recovery of stale jobs

### Negative

- **Polling overhead**: 1-second poll interval adds minor CPU usage
- **Single-node**: No distributed execution (acceptable for self-hosted)
- **Custom code**: Must maintain scheduler implementation

### Risks

- **Clock skew**: Jobs may execute slightly late if system clock drifts
  - Mitigation: Use NTP, accept 1-second precision
- **Long-running jobs**: May block other jobs
  - Mitigation: Timeout enforcement, separate critical jobs

## Configuration

```yaml
scheduler:
  enabled: true
  pollIntervalMs: 1000
  lockTimeoutMs: 300000
  maxConcurrentJobs: 10

  retry:
    defaultMaxAttempts: 3
    baseDelayMs: 60000
    maxDelayMs: 3600000

  cleanup:
    completedJobRetentionDays: 7
    dlqRetentionDays: 30

  alerts:
    dlqThreshold: 10
    queueDepthThreshold: 500
    oldestPendingThresholdMinutes: 30
```

## References

- [Automation Use Cases](../../02-use-cases/operations/automation.md)
- [Database Schema](../../04-specs/database/schema.ts)
- [ADR-003: Message Queue](003-message-queue.md)
