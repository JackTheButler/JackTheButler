/**
 * Scheduler Service
 *
 * Manages periodic background jobs like PMS sync.
 * Uses simple setInterval for lightweight scheduling.
 */

import { NotFoundError } from '@/errors/index.js';
import { createLogger } from '@/utils/logger.js';
import { pmsSyncService, getPMSSyncConfig } from './pms-sync.js';
import { writeActivityLog } from './activity-log.js';
import { sqlite } from '@/db/index.js';
import { getAppRegistry } from '@/apps/registry.js';
import { conversationService } from './conversation.js';

const log = createLogger('scheduler');

interface ScheduledJob {
  name: string;
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
  lastRun: Date | null;
  lastResult: 'success' | 'error' | null;
  isRunning: boolean;
}

/**
 * Scheduler manages periodic background tasks
 */
export class Scheduler {
  private jobs = new Map<string, ScheduledJob>();
  private lastSyncTime: Date | null = null;

  /**
   * Start all scheduled jobs
   */
  start(): void {
    // PMS Sync job — only schedule if a PMS app is active in the registry
    if (getAppRegistry().getActivePMSApp()) {
      const { syncIntervalMs } = getPMSSyncConfig();
      this.scheduleJob('pms-sync', syncIntervalMs, () => this.runPMSSync());
    }

    // Log purge job — delete activity_log + app_logs entries older than 30 days (runs daily)
    this.scheduleJob('log-purge', 24 * 60 * 60 * 1000, async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffISO = cutoff.toISOString();

      const actResult = sqlite.prepare('DELETE FROM activity_log WHERE created_at < ?').run(cutoffISO);
      const appResult = sqlite.prepare('DELETE FROM app_logs WHERE created_at < ?').run(cutoffISO);
      const activityLogDeleted = actResult.changes ?? 0;
      const appLogsDeleted = appResult.changes ?? 0;
      if (activityLogDeleted + appLogsDeleted > 0) {
        log.info({ activityLog: activityLogDeleted, appLogs: appLogsDeleted }, 'Purged old log entries');
      }
      return { activityLogDeleted, appLogsDeleted, cutoffDate: cutoff.toISOString().split('T')[0] };
    });

    // Conversation idle timeout (every 30 minutes)
    // Closes conversations that have had no activity for 4 hours
    this.scheduleJob('conversation-idle-timeout', 30 * 60 * 1000, () => this.runConversationIdleTimeout());

    // WebChat session cleanup (every hour)
    this.scheduleJob('webchat-session-cleanup', 60 * 60 * 1000, async () => {
      const { webchatSessionService } = await import('./webchat-session.js');
      const sessionsDeleted = await webchatSessionService.cleanupExpired();
      if (sessionsDeleted > 0) {
        log.info({ deleted: sessionsDeleted }, 'Cleaned up expired webchat sessions');
      }

      const { cleanupRateLimitMaps } = await import('./webchat-action.js');
      const rateLimitCleaned = cleanupRateLimitMaps();
      if (rateLimitCleaned > 0) {
        log.info({ cleaned: rateLimitCleaned }, 'Cleaned up stale rate-limit entries');
      }
      return { sessionsDeleted, rateLimitCleaned };
    });

    const jobSummary = Object.fromEntries(
      Array.from(this.jobs.entries()).map(([name, job]) => [name, job.intervalMs / 1000])
    );
    log.info({ jobs: jobSummary }, 'Scheduler started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    for (const [name, job] of this.jobs) {
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = null;
      }
      log.info({ name }, 'Stopped scheduled job');
    }
    this.jobs.clear();
    log.info('Scheduler stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus(): { jobs: Array<{ name: string; intervalMs: number; lastRun: string | null; lastResult: string | null; isRunning: boolean }> } {
    const jobs = Array.from(this.jobs.values()).map((job) => ({
      name: job.name,
      intervalMs: job.intervalMs,
      lastRun: job.lastRun?.toISOString() ?? null,
      lastResult: job.lastResult,
      isRunning: job.isRunning,
    }));
    return { jobs };
  }

  /**
   * Manually trigger a job
   */
  async triggerJob(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new NotFoundError('Job', name);
    }

    if (job.isRunning) {
      log.warn({ name }, 'Job is already running, skipping manual trigger');
      return;
    }

    log.info({ name }, 'Manually triggering job');

    if (name === 'pms-sync') {
      await this.runPMSSync();
    } else if (name === 'log-purge') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffISO = cutoff.toISOString();
      sqlite.prepare('DELETE FROM activity_log WHERE created_at < ?').run(cutoffISO);
      sqlite.prepare('DELETE FROM app_logs WHERE created_at < ?').run(cutoffISO);
    } else if (name === 'conversation-idle-timeout') {
      await this.runConversationIdleTimeout();
    } else if (name === 'webchat-session-cleanup') {
      const { webchatSessionService } = await import('./webchat-session.js');
      const count = await webchatSessionService.cleanupExpired();
      if (count > 0) {
        log.info({ deleted: count }, 'Cleaned up expired webchat sessions');
      }

      const { cleanupRateLimitMaps } = await import('./webchat-action.js');
      const rateLimitCleaned = cleanupRateLimitMaps();
      if (rateLimitCleaned > 0) {
        log.info({ cleaned: rateLimitCleaned }, 'Cleaned up stale rate-limit entries');
      }
    }
  }

  /**
   * Schedule a recurring job
   */
  private scheduleJob(name: string, intervalMs: number, handler: () => Promise<Record<string, unknown> | void>): void {
    const job: ScheduledJob = {
      name,
      intervalMs,
      timer: null,
      lastRun: null,
      lastResult: null,
      isRunning: false,
    };

    const wrappedHandler = async (): Promise<void> => {
      if (job.isRunning) {
        log.warn({ name }, 'Skipping scheduled run - job still running');
        return;
      }

      job.isRunning = true;
      job.lastRun = new Date();
      const t0 = Date.now();
      let handlerDetails: Record<string, unknown> = {};

      try {
        const result = await handler();
        if (result) handlerDetails = result;
        job.lastResult = 'success';
      } catch (err) {
        job.lastResult = 'error';
        log.error({ err, name }, 'Scheduled job failed');
      } finally {
        job.isRunning = false;
        try {
          writeActivityLog(
            'system',
            'scheduler.outcome',
            job.lastResult === 'success' ? 'success' : 'failed',
            undefined,
            job.lastResult === 'error' ? `Job ${name} failed` : undefined,
            Date.now() - t0,
            { job: name, ...handlerDetails }
          );
        } catch {
          // Never let a log write affect job scheduling
        }
      }
    };

    job.timer = setInterval(wrappedHandler, intervalMs);
    this.jobs.set(name, job);

    // Run immediately on first start
    wrappedHandler().catch(() => {
      // Error already logged in wrapper
    });
  }

  /**
   * Close conversations that have been idle beyond the timeout threshold.
   * Default: 4 hours since last message.
   */
  private async runConversationIdleTimeout(idleTimeoutMs = 4 * 60 * 60 * 1000): Promise<Record<string, unknown>> {
    const cutoff = new Date(Date.now() - idleTimeoutMs).toISOString();

    const idleRows = sqlite
      .prepare(
        `SELECT id, guest_id FROM conversations
         WHERE state IN ('active', 'waiting', 'escalated', 'resolved')
           AND (last_message_at < ? OR (last_message_at IS NULL AND updated_at < ?))`
      )
      .all(cutoff, cutoff) as Array<{ id: string; guest_id: string | null }>;

    let closed = 0;
    for (const row of idleRows) {
      try {
        await conversationService.update(row.id, { state: 'closed', _closeReason: 'timeout' });
        closed++;
      } catch (err) {
        log.error({ err, conversationId: row.id }, 'Failed to close idle conversation');
      }
    }

    if (closed > 0) {
      log.info({ closed, cutoff }, 'Closed idle conversations');
    }

    return { closed, cutoff };
  }

  /**
   * Run PMS sync
   */
  private async runPMSSync(): Promise<Record<string, unknown>> {
    log.debug('Running PMS sync job');

    const since = this.lastSyncTime;
    const result = await pmsSyncService.syncReservations(since ?? undefined);

    this.lastSyncTime = new Date();

    if (result.errors > 0) {
      log.warn({ errorCount: result.errors, errors: result.errorDetails }, 'PMS sync had errors');
    }

    return {
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      errors: result.errors,
      since: since?.toISOString() ?? null,
    };
  }
}

/**
 * Singleton scheduler instance
 */
export const scheduler = new Scheduler();
