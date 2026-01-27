# Analytics Data Pipeline Specification

This document defines the analytics data pipeline for Jack The Butler.

---

## Overview

Jack collects operational data and transforms it into actionable insights through:

- Raw event collection
- Scheduled aggregation
- Materialized metrics
- Dashboard queries

---

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Events    │────▶│  Raw Store  │────▶│ Aggregation │────▶│  Metrics    │
│  (realtime) │     │  (events)   │     │    Jobs     │     │  (queries)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Materialized│
                                        │    Views    │
                                        └─────────────┘
```

---

## Raw Event Storage

### Event Schema

```sql
CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,          -- ISO 8601
  property_id TEXT NOT NULL,

  -- Dimensions (for filtering/grouping)
  channel TEXT,                     -- 'whatsapp', 'sms', 'email', 'webchat'
  guest_id TEXT,
  staff_id TEXT,
  conversation_id TEXT,
  task_id TEXT,

  -- Measures (numeric values)
  value REAL,                       -- Generic numeric value
  duration_ms INTEGER,              -- For timing events

  -- Additional context
  metadata JSON,                    -- Flexible attributes

  -- Partitioning
  date_partition TEXT GENERATED ALWAYS AS (substr(timestamp, 1, 10)) STORED
);

-- Indexes for common queries
CREATE INDEX idx_events_type_date ON analytics_events(event_type, date_partition);
CREATE INDEX idx_events_property_date ON analytics_events(property_id, date_partition);
CREATE INDEX idx_events_channel ON analytics_events(channel, date_partition);
```

### Event Types

```typescript
type AnalyticsEventType =
  // Message events
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'

  // Conversation events
  | 'conversation.started'
  | 'conversation.escalated'
  | 'conversation.resolved'
  | 'conversation.closed'

  // Response events
  | 'response.ai_generated'
  | 'response.staff_sent'
  | 'response.time_recorded'

  // Task events
  | 'task.created'
  | 'task.assigned'
  | 'task.completed'
  | 'task.sla_breached'

  // Intent events
  | 'intent.classified'
  | 'intent.confidence_low'
  | 'intent.action_taken'

  // Satisfaction events
  | 'satisfaction.survey_sent'
  | 'satisfaction.rating_received'
  | 'satisfaction.feedback_received'

  // Staff events
  | 'staff.login'
  | 'staff.logout'
  | 'staff.status_changed';
```

### Event Recording

```typescript
interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  timestamp: Date;
  propertyId: string;
  channel?: ChannelType;
  guestId?: string;
  staffId?: string;
  conversationId?: string;
  taskId?: string;
  value?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

class AnalyticsCollector {
  private buffer: AnalyticsEvent[] = [];
  private flushInterval: NodeJS.Timer;

  constructor(private db: Database) {
    // Batch insert every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  record(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>): void {
    this.buffer.push({
      id: generateId('evt'),
      timestamp: new Date(),
      ...event,
    });

    // Flush immediately if buffer is large
    if (this.buffer.length >= 100) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0);

    const stmt = this.db.prepare(`
      INSERT INTO analytics_events
      (id, event_type, timestamp, property_id, channel, guest_id, staff_id,
       conversation_id, task_id, value, duration_ms, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((events: AnalyticsEvent[]) => {
      for (const event of events) {
        stmt.run(
          event.id,
          event.eventType,
          event.timestamp.toISOString(),
          event.propertyId,
          event.channel,
          event.guestId,
          event.staffId,
          event.conversationId,
          event.taskId,
          event.value,
          event.durationMs,
          JSON.stringify(event.metadata)
        );
      }
    });

    insertMany(events);
  }
}
```

---

## Aggregation Jobs

### Aggregation Schedule

```typescript
interface AggregationJob {
  name: string;
  schedule: string;              // Cron expression
  aggregation: AggregationType;
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly';
  retention: number;             // Days to keep
}

const AGGREGATION_JOBS: AggregationJob[] = [
  // Hourly aggregations (run every hour)
  {
    name: 'hourly_message_counts',
    schedule: '0 * * * *',
    aggregation: 'message_counts',
    granularity: 'hourly',
    retention: 30,               // Keep 30 days of hourly data
  },
  {
    name: 'hourly_response_times',
    schedule: '5 * * * *',
    aggregation: 'response_times',
    granularity: 'hourly',
    retention: 30,
  },

  // Daily aggregations (run at 1 AM)
  {
    name: 'daily_conversation_metrics',
    schedule: '0 1 * * *',
    aggregation: 'conversation_metrics',
    granularity: 'daily',
    retention: 365,              // Keep 1 year of daily data
  },
  {
    name: 'daily_staff_performance',
    schedule: '0 1 * * *',
    aggregation: 'staff_performance',
    granularity: 'daily',
    retention: 365,
  },
  {
    name: 'daily_intent_distribution',
    schedule: '0 1 * * *',
    aggregation: 'intent_distribution',
    granularity: 'daily',
    retention: 365,
  },

  // Weekly aggregations (run Sunday 2 AM)
  {
    name: 'weekly_satisfaction_trends',
    schedule: '0 2 * * 0',
    aggregation: 'satisfaction_trends',
    granularity: 'weekly',
    retention: 730,              // Keep 2 years
  },

  // Monthly aggregations (run 1st of month 3 AM)
  {
    name: 'monthly_summary',
    schedule: '0 3 1 * *',
    aggregation: 'monthly_summary',
    granularity: 'monthly',
    retention: 1095,             // Keep 3 years
  },
];
```

### Aggregation Tables

```sql
-- Hourly message counts
CREATE TABLE agg_message_counts_hourly (
  period_start TEXT NOT NULL,    -- ISO 8601 hour start
  property_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,       -- 'inbound', 'outbound'
  count INTEGER NOT NULL,

  PRIMARY KEY (period_start, property_id, channel, direction)
);

-- Daily conversation metrics
CREATE TABLE agg_conversation_metrics_daily (
  period_date TEXT NOT NULL,     -- YYYY-MM-DD
  property_id TEXT NOT NULL,
  channel TEXT NOT NULL,

  -- Counts
  conversations_started INTEGER DEFAULT 0,
  conversations_resolved INTEGER DEFAULT 0,
  conversations_escalated INTEGER DEFAULT 0,

  -- Response times (milliseconds)
  avg_first_response_ms INTEGER,
  p50_first_response_ms INTEGER,
  p95_first_response_ms INTEGER,

  -- Resolution times (minutes)
  avg_resolution_minutes INTEGER,
  p50_resolution_minutes INTEGER,
  p95_resolution_minutes INTEGER,

  -- AI metrics
  ai_handled_count INTEGER DEFAULT 0,
  ai_escalated_count INTEGER DEFAULT 0,

  PRIMARY KEY (period_date, property_id, channel)
);

-- Daily staff performance
CREATE TABLE agg_staff_performance_daily (
  period_date TEXT NOT NULL,
  property_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,

  conversations_handled INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,
  satisfaction_avg REAL,
  satisfaction_count INTEGER DEFAULT 0,

  PRIMARY KEY (period_date, property_id, staff_id)
);

-- Daily intent distribution
CREATE TABLE agg_intent_distribution_daily (
  period_date TEXT NOT NULL,
  property_id TEXT NOT NULL,
  intent TEXT NOT NULL,

  count INTEGER DEFAULT 0,
  avg_confidence REAL,
  action_taken_count INTEGER DEFAULT 0,
  escalated_count INTEGER DEFAULT 0,

  PRIMARY KEY (period_date, property_id, intent)
);

-- Weekly satisfaction trends
CREATE TABLE agg_satisfaction_weekly (
  period_start TEXT NOT NULL,    -- Week start date
  property_id TEXT NOT NULL,
  channel TEXT NOT NULL,

  surveys_sent INTEGER DEFAULT 0,
  responses_received INTEGER DEFAULT 0,
  rating_1 INTEGER DEFAULT 0,
  rating_2 INTEGER DEFAULT 0,
  rating_3 INTEGER DEFAULT 0,
  rating_4 INTEGER DEFAULT 0,
  rating_5 INTEGER DEFAULT 0,
  avg_rating REAL,
  nps_score REAL,                -- Net Promoter Score

  PRIMARY KEY (period_start, property_id, channel)
);

-- Monthly summary
CREATE TABLE agg_monthly_summary (
  period_month TEXT NOT NULL,    -- YYYY-MM
  property_id TEXT NOT NULL,

  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,

  ai_resolution_rate REAL,
  avg_satisfaction REAL,
  avg_response_time_minutes REAL,

  top_intents JSON,              -- Array of {intent, count}
  channel_breakdown JSON,        -- {channel: count}

  PRIMARY KEY (period_month, property_id)
);
```

### Aggregation Implementation

```typescript
class AggregationService {
  constructor(private db: Database) {}

  async runAggregation(job: AggregationJob): Promise<AggregationResult> {
    const periodEnd = new Date();
    const periodStart = this.getPeriodStart(periodEnd, job.granularity);

    logger.info('Running aggregation', {
      job: job.name,
      periodStart,
      periodEnd,
    });

    switch (job.aggregation) {
      case 'message_counts':
        return this.aggregateMessageCounts(periodStart, periodEnd, job.granularity);

      case 'conversation_metrics':
        return this.aggregateConversationMetrics(periodStart, periodEnd);

      case 'staff_performance':
        return this.aggregateStaffPerformance(periodStart, periodEnd);

      case 'intent_distribution':
        return this.aggregateIntentDistribution(periodStart, periodEnd);

      case 'satisfaction_trends':
        return this.aggregateSatisfaction(periodStart, periodEnd);

      case 'monthly_summary':
        return this.aggregateMonthlySummary(periodStart, periodEnd);

      default:
        throw new Error(`Unknown aggregation: ${job.aggregation}`);
    }
  }

  private async aggregateMessageCounts(
    periodStart: Date,
    periodEnd: Date,
    granularity: string
  ): Promise<AggregationResult> {
    const result = await this.db.prepare(`
      INSERT OR REPLACE INTO agg_message_counts_hourly
      (period_start, property_id, channel, direction, count)
      SELECT
        strftime('%Y-%m-%dT%H:00:00Z', timestamp) as period_start,
        property_id,
        channel,
        CASE
          WHEN event_type = 'message.received' THEN 'inbound'
          ELSE 'outbound'
        END as direction,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type IN ('message.received', 'message.sent')
        AND timestamp >= ?
        AND timestamp < ?
      GROUP BY period_start, property_id, channel, direction
    `).run(periodStart.toISOString(), periodEnd.toISOString());

    return { rowsAffected: result.changes };
  }

  private async aggregateConversationMetrics(
    periodStart: Date,
    periodEnd: Date
  ): Promise<AggregationResult> {
    // Get conversation counts
    const counts = await this.db.prepare(`
      SELECT
        date(timestamp) as period_date,
        property_id,
        channel,
        SUM(CASE WHEN event_type = 'conversation.started' THEN 1 ELSE 0 END) as started,
        SUM(CASE WHEN event_type = 'conversation.resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN event_type = 'conversation.escalated' THEN 1 ELSE 0 END) as escalated
      FROM analytics_events
      WHERE event_type IN ('conversation.started', 'conversation.resolved', 'conversation.escalated')
        AND timestamp >= ?
        AND timestamp < ?
      GROUP BY period_date, property_id, channel
    `).all(periodStart.toISOString(), periodEnd.toISOString());

    // Get response time percentiles
    const responseTimes = await this.db.prepare(`
      SELECT
        date(timestamp) as period_date,
        property_id,
        channel,
        AVG(duration_ms) as avg_ms,
        -- SQLite doesn't have native percentile, approximate with subqueries
        duration_ms as duration
      FROM analytics_events
      WHERE event_type = 'response.time_recorded'
        AND timestamp >= ?
        AND timestamp < ?
    `).all(periodStart.toISOString(), periodEnd.toISOString());

    // Insert aggregated data
    // ... (combine counts and response times)

    return { rowsAffected: counts.length };
  }

  private getPeriodStart(periodEnd: Date, granularity: string): Date {
    switch (granularity) {
      case 'hourly':
        return subHours(periodEnd, 1);
      case 'daily':
        return subDays(periodEnd, 1);
      case 'weekly':
        return subWeeks(periodEnd, 1);
      case 'monthly':
        return subMonths(periodEnd, 1);
      default:
        throw new Error(`Unknown granularity: ${granularity}`);
    }
  }
}
```

---

## Materialized Views

### Real-time Dashboard Metrics

```typescript
// Pre-computed metrics for dashboard
interface DashboardMetrics {
  // Today's metrics (updated every minute)
  today: {
    conversationsActive: number;
    conversationsResolved: number;
    messagesReceived: number;
    messagesSent: number;
    avgResponseTimeMs: number;
    escalationRate: number;
  };

  // Comparison with previous period
  comparison: {
    conversationsChange: number;  // Percentage change
    responseTimeChange: number;
    satisfactionChange: number;
  };

  // Active metrics
  activeConversations: number;
  staffOnline: number;
  pendingTasks: number;
}

class MetricsCache {
  private cache = new LRUCache<string, DashboardMetrics>({
    max: 100,
    ttl: 60000, // 1 minute
  });

  async getDashboardMetrics(propertyId: string): Promise<DashboardMetrics> {
    const cacheKey = `dashboard:${propertyId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const metrics = await this.computeDashboardMetrics(propertyId);
    this.cache.set(cacheKey, metrics);
    return metrics;
  }

  private async computeDashboardMetrics(propertyId: string): Promise<DashboardMetrics> {
    const todayStart = startOfDay(new Date()).toISOString();
    const yesterdayStart = startOfDay(subDays(new Date(), 1)).toISOString();

    // Today's metrics
    const today = await this.db.prepare(`
      SELECT
        SUM(CASE WHEN event_type = 'conversation.started' THEN 1 ELSE 0 END) as conversations_started,
        SUM(CASE WHEN event_type = 'conversation.resolved' THEN 1 ELSE 0 END) as conversations_resolved,
        SUM(CASE WHEN event_type = 'message.received' THEN 1 ELSE 0 END) as messages_received,
        SUM(CASE WHEN event_type = 'message.sent' THEN 1 ELSE 0 END) as messages_sent,
        AVG(CASE WHEN event_type = 'response.time_recorded' THEN duration_ms END) as avg_response_ms,
        SUM(CASE WHEN event_type = 'conversation.escalated' THEN 1 ELSE 0 END) * 1.0 /
          NULLIF(SUM(CASE WHEN event_type = 'conversation.started' THEN 1 ELSE 0 END), 0) as escalation_rate
      FROM analytics_events
      WHERE property_id = ?
        AND timestamp >= ?
    `).get(propertyId, todayStart);

    // Yesterday's metrics for comparison
    const yesterday = await this.db.prepare(`
      SELECT
        SUM(CASE WHEN event_type = 'conversation.started' THEN 1 ELSE 0 END) as conversations,
        AVG(CASE WHEN event_type = 'response.time_recorded' THEN duration_ms END) as avg_response_ms
      FROM analytics_events
      WHERE property_id = ?
        AND timestamp >= ?
        AND timestamp < ?
    `).get(propertyId, yesterdayStart, todayStart);

    // Active counts
    const active = await this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM conversations WHERE status = 'active') as active_conversations,
        (SELECT COUNT(*) FROM staff WHERE status = 'available') as staff_online,
        (SELECT COUNT(*) FROM tasks WHERE status = 'pending') as pending_tasks
    `).get();

    return {
      today: {
        conversationsActive: active.active_conversations,
        conversationsResolved: today.conversations_resolved || 0,
        messagesReceived: today.messages_received || 0,
        messagesSent: today.messages_sent || 0,
        avgResponseTimeMs: today.avg_response_ms || 0,
        escalationRate: today.escalation_rate || 0,
      },
      comparison: {
        conversationsChange: this.percentChange(today.conversations_started, yesterday.conversations),
        responseTimeChange: this.percentChange(today.avg_response_ms, yesterday.avg_response_ms),
        satisfactionChange: 0, // Would need satisfaction data
      },
      activeConversations: active.active_conversations,
      staffOnline: active.staff_online,
      pendingTasks: active.pending_tasks,
    };
  }

  private percentChange(current: number, previous: number): number {
    if (!previous) return 0;
    return ((current - previous) / previous) * 100;
  }
}
```

---

## Historical Data Queries

### Time-Series Queries

```typescript
interface TimeSeriesQuery {
  metric: string;
  granularity: 'hour' | 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  propertyId: string;
  dimensions?: string[];         // Group by dimensions
}

async function queryTimeSeries(query: TimeSeriesQuery): Promise<TimeSeriesResult> {
  let tableName: string;
  let periodColumn: string;

  // Select appropriate aggregation table
  switch (query.granularity) {
    case 'hour':
      tableName = 'agg_message_counts_hourly';
      periodColumn = 'period_start';
      break;
    case 'day':
      tableName = 'agg_conversation_metrics_daily';
      periodColumn = 'period_date';
      break;
    case 'week':
      tableName = 'agg_satisfaction_weekly';
      periodColumn = 'period_start';
      break;
    case 'month':
      tableName = 'agg_monthly_summary';
      periodColumn = 'period_month';
      break;
  }

  const groupBy = query.dimensions?.length
    ? `, ${query.dimensions.join(', ')}`
    : '';

  const results = await db.prepare(`
    SELECT
      ${periodColumn} as period,
      ${query.metric}
      ${groupBy}
    FROM ${tableName}
    WHERE property_id = ?
      AND ${periodColumn} >= ?
      AND ${periodColumn} < ?
    ORDER BY ${periodColumn}
  `).all(
    query.propertyId,
    formatDate(query.startDate),
    formatDate(query.endDate)
  );

  return {
    query,
    data: results,
    metadata: {
      rowCount: results.length,
      queryTime: Date.now(),
    },
  };
}
```

### Report Generation

```typescript
interface ReportConfig {
  type: 'daily' | 'weekly' | 'monthly';
  propertyId: string;
  dateRange: { start: Date; end: Date };
  sections: ReportSection[];
}

type ReportSection =
  | 'summary'
  | 'conversations'
  | 'response_times'
  | 'staff_performance'
  | 'satisfaction'
  | 'top_intents'
  | 'channel_breakdown';

async function generateReport(config: ReportConfig): Promise<Report> {
  const report: Report = {
    generatedAt: new Date(),
    propertyId: config.propertyId,
    period: config.dateRange,
    sections: {},
  };

  for (const section of config.sections) {
    switch (section) {
      case 'summary':
        report.sections.summary = await generateSummarySection(config);
        break;

      case 'conversations':
        report.sections.conversations = await generateConversationsSection(config);
        break;

      case 'response_times':
        report.sections.responseTimes = await generateResponseTimesSection(config);
        break;

      case 'staff_performance':
        report.sections.staffPerformance = await generateStaffSection(config);
        break;

      case 'satisfaction':
        report.sections.satisfaction = await generateSatisfactionSection(config);
        break;

      case 'top_intents':
        report.sections.topIntents = await generateIntentsSection(config);
        break;

      case 'channel_breakdown':
        report.sections.channelBreakdown = await generateChannelSection(config);
        break;
    }
  }

  return report;
}

async function generateSummarySection(config: ReportConfig): Promise<SummarySection> {
  const { start, end } = config.dateRange;

  const summary = await db.prepare(`
    SELECT
      SUM(total_conversations) as conversations,
      SUM(total_messages) as messages,
      SUM(total_tasks) as tasks,
      AVG(ai_resolution_rate) as ai_resolution_rate,
      AVG(avg_satisfaction) as satisfaction,
      AVG(avg_response_time_minutes) as response_time
    FROM agg_monthly_summary
    WHERE property_id = ?
      AND period_month >= ?
      AND period_month <= ?
  `).get(
    config.propertyId,
    format(start, 'yyyy-MM'),
    format(end, 'yyyy-MM')
  );

  return {
    totalConversations: summary.conversations,
    totalMessages: summary.messages,
    totalTasks: summary.tasks,
    aiResolutionRate: summary.ai_resolution_rate,
    avgSatisfaction: summary.satisfaction,
    avgResponseTimeMinutes: summary.response_time,
  };
}
```

---

## Data Cleanup

### Aggregation Data Retention

```typescript
async function cleanupOldAggregations(): Promise<void> {
  const cleanupTasks = [
    { table: 'agg_message_counts_hourly', retentionDays: 30 },
    { table: 'agg_conversation_metrics_daily', retentionDays: 365 },
    { table: 'agg_staff_performance_daily', retentionDays: 365 },
    { table: 'agg_intent_distribution_daily', retentionDays: 365 },
    { table: 'agg_satisfaction_weekly', retentionDays: 730 },
    { table: 'agg_monthly_summary', retentionDays: 1095 },
  ];

  for (const task of cleanupTasks) {
    const cutoff = subDays(new Date(), task.retentionDays).toISOString();

    const result = await db.prepare(`
      DELETE FROM ${task.table}
      WHERE period_start < ? OR period_date < ? OR period_month < ?
    `).run(cutoff, cutoff.slice(0, 10), cutoff.slice(0, 7));

    logger.info('Cleaned up aggregation data', {
      table: task.table,
      deleted: result.changes,
      cutoff,
    });
  }
}

// Raw events cleanup
async function cleanupRawEvents(): Promise<void> {
  // Keep raw events for 90 days
  const cutoff = subDays(new Date(), 90).toISOString();

  const result = await db.prepare(`
    DELETE FROM analytics_events
    WHERE timestamp < ?
  `).run(cutoff);

  logger.info('Cleaned up raw events', {
    deleted: result.changes,
    cutoff,
  });
}
```

---

## Configuration

```yaml
analytics:
  # Event collection
  collection:
    enabled: true
    batchSize: 100
    flushInterval: 5000          # 5 seconds

  # Aggregation
  aggregation:
    enabled: true
    timezone: "UTC"              # Timezone for daily/weekly boundaries

  # Retention
  retention:
    rawEvents: 90                # Days
    hourlyAggregations: 30       # Days
    dailyAggregations: 365       # Days
    weeklyAggregations: 730      # Days
    monthlyAggregations: 1095    # Days

  # Dashboard cache
  cache:
    enabled: true
    ttl: 60000                   # 1 minute

  # Reports
  reports:
    enabled: true
    formats: ['json', 'csv']
    storage: './data/reports'
```

---

## Related

- [Events](../api/events.md) - Event types
- [Data Retention](../../05-operations/data-retention.md) - Retention policies
- [Job Scheduler](../../03-architecture/decisions/005-job-scheduler.md) - Scheduled jobs
