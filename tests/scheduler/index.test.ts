/**
 * Scheduler Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, activityLog, appLogs, conversations, guests } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import { NotFoundError } from '@/errors/index.js';
import { conversationService } from '@/services/conversation.js';

vi.mock('@/apps/registry.js', () => ({ getAppRegistry: vi.fn() }));

vi.mock('@/services/pms-sync.js', () => ({
  pmsSyncService: { syncReservations: vi.fn() },
  getPMSSyncConfig: vi.fn(),
}));

vi.mock('@/services/webchat-session.js', () => ({
  webchatSessionService: { cleanupExpired: vi.fn().mockResolvedValue(0) },
}));

vi.mock('@/apps/channels/webchat/actions.js', () => ({
  cleanupRateLimitMaps: vi.fn().mockReturnValue(0),
}));

const { Scheduler } = await import('@/scheduler/index.js');
const { getAppRegistry } = await import('@/apps/registry.js');
const { pmsSyncService, getPMSSyncConfig } = await import('@/services/pms-sync.js');
const { webchatSessionService } = await import('@/services/webchat-session.js');
const { cleanupRateLimitMaps } = await import('@/apps/channels/webchat/actions.js');

const SYNC_INTERVAL_MS = 900_000;
const LOG_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONVERSATION_IDLE_INTERVAL_MS = 30 * 60 * 1000;
const WEBCHAT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function mockNoPMS() {
  vi.mocked(getAppRegistry).mockReturnValue({ getActivePMSApp: () => undefined } as never);
}

function mockActivePMS() {
  vi.mocked(getAppRegistry).mockReturnValue({
    getActivePMSApp: () => ({ id: 'test-pms', config: {} }),
  } as never);
  vi.mocked(getPMSSyncConfig).mockReturnValue({
    stalenessThresholdMs: 300_000,
    syncIntervalMs: SYNC_INTERVAL_MS,
  });
}

describe('Scheduler', () => {
  let scheduler: InstanceType<typeof Scheduler>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(pmsSyncService.syncReservations).mockResolvedValue({
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: 0,
      errorDetails: [],
    });
    vi.mocked(webchatSessionService.cleanupExpired).mockResolvedValue(0);
    vi.mocked(cleanupRateLimitMaps).mockReturnValue(0);

    // The temp DB is shared across all tests in this file (fresh per file, not per test).
    // Reset rows touched by scheduled jobs so assertions on counts/rows aren't
    // contaminated by earlier tests in this suite.
    await db.delete(activityLog);
    await db.delete(appLogs);
    await db.delete(conversations);
    await db.delete(guests);
  });

  afterEach(() => {
    scheduler?.stop();
    vi.useRealTimers();
  });

  describe('start', () => {
    it('registers pms-sync, log-purge, conversation-idle-timeout, and webchat-session-cleanup when a PMS app is active', async () => {
      mockActivePMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const names = scheduler.getStatus().jobs.map((j) => j.name).sort();
      expect(names).toEqual(
        ['conversation-idle-timeout', 'log-purge', 'pms-sync', 'webchat-session-cleanup'].sort()
      );
    });

    it('does not register pms-sync when no PMS app is active', async () => {
      mockNoPMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const names = scheduler.getStatus().jobs.map((j) => j.name);
      expect(names).not.toContain('pms-sync');
      expect(names).toEqual(
        expect.arrayContaining(['log-purge', 'conversation-idle-timeout', 'webchat-session-cleanup'])
      );
    });

    it('runs every job immediately on start and records success', async () => {
      mockNoPMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const status = scheduler.getStatus();
      for (const job of status.jobs) {
        expect(job.lastRun).not.toBeNull();
        expect(job.lastResult).toBe('success');
        expect(job.isRunning).toBe(false);
      }
      expect(webchatSessionService.cleanupExpired).toHaveBeenCalledTimes(1);
    });

    it('writes a scheduler.outcome activity_log row for each immediate run', async () => {
      mockNoPMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const rows = await db.select().from(activityLog).where(eq(activityLog.eventType, 'scheduler.outcome'));
      // log-purge, conversation-idle-timeout, webchat-session-cleanup (3 jobs registered, no PMS)
      expect(rows.length).toBe(3);
      expect(rows.every((r) => r.status === 'success')).toBe(true);
    });

    it('re-runs a job when its interval elapses', async () => {
      mockNoPMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(webchatSessionService.cleanupExpired).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(WEBCHAT_CLEANUP_INTERVAL_MS);
      expect(webchatSessionService.cleanupExpired).toHaveBeenCalledTimes(2);
    });

    it('skips a scheduled re-run while the previous run is still in flight (isRunning guard)', async () => {
      mockActivePMS();
      let resolveSync!: (v: Awaited<ReturnType<typeof pmsSyncService.syncReservations>>) => void;
      vi.mocked(pmsSyncService.syncReservations).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSync = resolve;
          })
      );

      scheduler = new Scheduler();
      scheduler.start();
      // Flush the immediate run — it stays pending because syncReservations never resolves yet
      await vi.advanceTimersByTimeAsync(0);
      expect(pmsSyncService.syncReservations).toHaveBeenCalledTimes(1);

      // Advance a full interval — the timer fires again, but the job is still "running"
      // so the wrapped handler should skip invoking the handler a second time.
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(pmsSyncService.syncReservations).toHaveBeenCalledTimes(1);

      // Resolve the first run — job should settle back to not-running.
      resolveSync({ created: 0, updated: 0, unchanged: 0, errors: 0, errorDetails: [] });
      await vi.advanceTimersByTimeAsync(0);
      const pmsJob = scheduler.getStatus().jobs.find((j) => j.name === 'pms-sync');
      expect(pmsJob?.isRunning).toBe(false);
      expect(pmsJob?.lastResult).toBe('success');
    });

    it('records lastResult "error" and keeps the scheduler alive when a job handler throws', async () => {
      mockActivePMS();
      vi.mocked(pmsSyncService.syncReservations).mockRejectedValue(new Error('PMS down'));

      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const pmsJob = scheduler.getStatus().jobs.find((j) => j.name === 'pms-sync');
      expect(pmsJob?.lastResult).toBe('error');
      expect(pmsJob?.isRunning).toBe(false);

      const failedRows = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.eventType, 'scheduler.outcome'));
      const pmsRow = failedRows.find((r) => r.details?.includes('pms-sync'));
      expect(pmsRow?.status).toBe('failed');

      // Scheduler keeps running other jobs / future ticks despite the failure
      vi.mocked(pmsSyncService.syncReservations).mockResolvedValue({
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: 0,
        errorDetails: [],
      });
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      const pmsJobAfter = scheduler.getStatus().jobs.find((j) => j.name === 'pms-sync');
      expect(pmsJobAfter?.lastResult).toBe('success');
    });

    it('reports success (not error) when the sync resolves with a partial errorDetails count', async () => {
      // syncReservations() only rejects on a hard PMS-fetch failure — per-reservation
      // failures are aggregated into result.errors and still resolve normally, so the
      // job's own lastResult is 'success' even though some reservations failed to sync.
      mockActivePMS();
      vi.mocked(pmsSyncService.syncReservations).mockResolvedValue({
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: 2,
        errorDetails: [
          { id: 'res-1', error: 'bad data' },
          { id: 'res-2', error: 'bad data' },
        ],
      });

      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const pmsJob = scheduler.getStatus().jobs.find((j) => j.name === 'pms-sync');
      expect(pmsJob?.lastResult).toBe('success');

      const rows = await db.select().from(activityLog).where(eq(activityLog.eventType, 'scheduler.outcome'));
      const pmsRow = rows.find((r) => r.details?.includes('pms-sync'));
      expect(pmsRow?.status).toBe('success');
      expect(JSON.parse(pmsRow!.details!).errors).toBe(2);
    });

    it('reports lastResult "error" when every reservation in the sync failed', async () => {
      // errors > 0 and zero successes (created/updated/unchanged all 0) means the whole
      // sync run failed, unlike the partial-failure case above which still succeeds.
      mockActivePMS();
      vi.mocked(pmsSyncService.syncReservations).mockResolvedValue({
        created: 0,
        updated: 0,
        unchanged: 0,
        errors: 3,
        errorDetails: [
          { id: 'res-1', error: 'bad data' },
          { id: 'res-2', error: 'bad data' },
          { id: 'res-3', error: 'bad data' },
        ],
      });

      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const pmsJob = scheduler.getStatus().jobs.find((j) => j.name === 'pms-sync');
      expect(pmsJob?.lastResult).toBe('error');
      expect(pmsJob?.isRunning).toBe(false);

      const rows = await db.select().from(activityLog).where(eq(activityLog.eventType, 'scheduler.outcome'));
      const pmsRow = rows.find((r) => r.details?.includes('pms-sync'));
      expect(pmsRow?.status).toBe('failed');
    });

    it('purges activity_log and app_logs rows older than 30 days', async () => {
      mockNoPMS();
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      await db.insert(activityLog).values([
        { id: generateId('alog'), source: 'system', eventType: 'test.old', status: 'success', createdAt: oldDate },
        {
          id: generateId('alog'),
          source: 'system',
          eventType: 'test.recent',
          status: 'success',
          createdAt: recentDate,
        },
      ]);
      await db.insert(appLogs).values([
        {
          id: generateId('appLog'),
          appId: 'app-1',
          providerId: 'provider-1',
          eventType: 'sync',
          status: 'success',
          createdAt: oldDate,
        },
      ]);

      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const oldRows = await db.select().from(activityLog).where(eq(activityLog.eventType, 'test.old'));
      expect(oldRows).toHaveLength(0);
      const recentRows = await db.select().from(activityLog).where(eq(activityLog.eventType, 'test.recent'));
      expect(recentRows).toHaveLength(1);
      const oldAppLogRows = await db.select().from(appLogs).where(eq(appLogs.appId, 'app-1'));
      expect(oldAppLogRows).toHaveLength(0);
    });

    it('closes conversations idle beyond the 4h timeout and leaves recent ones untouched', async () => {
      mockNoPMS();
      const guestId = generateId('guest');
      await db.insert(guests).values({
        id: guestId,
        firstName: 'Idle',
        lastName: 'Guest',
        externalIds: '{}',
        createdAt: now(),
        updatedAt: now(),
      });

      const oldTime = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const idleConvId = generateId('conversation');
      const activeConvId = generateId('conversation');
      const newConvId = generateId('conversation');

      await db.insert(conversations).values([
        {
          id: idleConvId,
          guestId,
          channelType: 'webchat',
          channelId: 'sess-idle',
          state: 'active',
          metadata: '{}',
          lastMessageAt: oldTime,
          createdAt: oldTime,
          updatedAt: oldTime,
        },
        {
          id: activeConvId,
          guestId,
          channelType: 'webchat',
          channelId: 'sess-active',
          state: 'active',
          metadata: '{}',
          lastMessageAt: recentTime,
          createdAt: recentTime,
          updatedAt: recentTime,
        },
        {
          // 'new' state is not in the idle-closable set, even though it's old
          id: newConvId,
          guestId,
          channelType: 'webchat',
          channelId: 'sess-new',
          state: 'new',
          metadata: '{}',
          lastMessageAt: oldTime,
          createdAt: oldTime,
          updatedAt: oldTime,
        },
      ]);

      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const [idleRow] = await db.select().from(conversations).where(eq(conversations.id, idleConvId));
      const [activeRow] = await db.select().from(conversations).where(eq(conversations.id, activeConvId));
      const [newRow] = await db.select().from(conversations).where(eq(conversations.id, newConvId));

      expect(idleRow!.state).toBe('closed');
      expect(activeRow!.state).toBe('active');
      expect(newRow!.state).toBe('new');
    });

    it('logs the error and continues when closing one idle conversation fails', async () => {
      mockNoPMS();
      const guestId = generateId('guest');
      await db.insert(guests).values({
        id: guestId,
        firstName: 'Idle',
        lastName: 'Guest2',
        externalIds: '{}',
        createdAt: now(),
        updatedAt: now(),
      });
      const oldTime = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

      const failingConvId = generateId('conversation');
      const okConvId = generateId('conversation');
      await db.insert(conversations).values([
        {
          id: failingConvId,
          guestId,
          channelType: 'webchat',
          channelId: 'sess-fail',
          state: 'active',
          metadata: '{}',
          lastMessageAt: oldTime,
          createdAt: oldTime,
          updatedAt: oldTime,
        },
        {
          id: okConvId,
          guestId,
          channelType: 'webchat',
          channelId: 'sess-ok',
          state: 'active',
          metadata: '{}',
          lastMessageAt: oldTime,
          createdAt: oldTime,
          updatedAt: oldTime,
        },
      ]);

      // conversationService is a real singleton shared by both this test file and the
      // scheduler module — spying on it here affects the same instance the scheduler calls.
      // Reject only for the targeted id (rather than relying on call order) so the test
      // doesn't depend on unspecified SQLite row-return ordering.
      const originalUpdate = conversationService.update.bind(conversationService);
      const updateSpy = vi.spyOn(conversationService, 'update');
      updateSpy.mockImplementation(async (id, input) => {
        if (id === failingConvId) throw new Error('simulated DB failure');
        return originalUpdate(id, input);
      });

      try {
        scheduler = new Scheduler();
        scheduler.start();
        await vi.advanceTimersByTimeAsync(0);

        // The job as a whole still reports success — per-row errors are swallowed
        // and only logged (see src/scheduler/index.ts runConversationIdleTimeout).
        const idleJob = scheduler.getStatus().jobs.find((j) => j.name === 'conversation-idle-timeout');
        expect(idleJob?.lastResult).toBe('success');

        const rows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.channelType, 'webchat'));
        const failing = rows.find((r) => r.id === failingConvId);
        const ok = rows.find((r) => r.id === okConvId);
        // The failing row's update rejected, so it stays in its previous state.
        expect(failing!.state).toBe('active');
        expect(ok!.state).toBe('closed');
      } finally {
        updateSpy.mockRestore();
      }
    });
  });

  describe('stop', () => {
    it('clears all jobs and timers', async () => {
      mockNoPMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(scheduler.getStatus().jobs.length).toBeGreaterThan(0);

      scheduler.stop();
      expect(scheduler.getStatus().jobs).toEqual([]);

      // Advancing time after stop() must not trigger any further job runs
      vi.mocked(webchatSessionService.cleanupExpired).mockClear();
      await vi.advanceTimersByTimeAsync(WEBCHAT_CLEANUP_INTERVAL_MS * 2);
      expect(webchatSessionService.cleanupExpired).not.toHaveBeenCalled();
    });
  });

  describe('triggerJob', () => {
    it('throws NotFoundError for an unknown job name', async () => {
      mockNoPMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      await expect(scheduler.triggerJob('does-not-exist')).rejects.toThrow(NotFoundError);
    });

    it('manually runs pms-sync', async () => {
      mockActivePMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      vi.mocked(pmsSyncService.syncReservations).mockClear();

      await scheduler.triggerJob('pms-sync');

      expect(pmsSyncService.syncReservations).toHaveBeenCalledTimes(1);
    });

    it('manually runs log-purge', async () => {
      mockNoPMS();
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      await db
        .insert(activityLog)
        .values({ id: generateId('alog'), source: 'system', eventType: 'manual.old', status: 'success', createdAt: oldDate });

      await scheduler.triggerJob('log-purge');

      const rows = await db.select().from(activityLog).where(eq(activityLog.eventType, 'manual.old'));
      expect(rows).toHaveLength(0);
    });

    it('manually runs webchat-session-cleanup', async () => {
      mockNoPMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      vi.mocked(webchatSessionService.cleanupExpired).mockClear();
      vi.mocked(cleanupRateLimitMaps).mockClear();

      await scheduler.triggerJob('webchat-session-cleanup');

      expect(webchatSessionService.cleanupExpired).toHaveBeenCalledTimes(1);
      expect(cleanupRateLimitMaps).toHaveBeenCalledTimes(1);
    });

    it('does not invoke the handler when the job is already marked as running', async () => {
      mockActivePMS();
      let resolveSync!: (v: Awaited<ReturnType<typeof pmsSyncService.syncReservations>>) => void;
      vi.mocked(pmsSyncService.syncReservations).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSync = resolve;
          })
      );

      scheduler = new Scheduler();
      scheduler.start();
      // The immediate run on start() stays in flight — syncReservations never resolves yet —
      // so job.isRunning is true via the public start()/getStatus() surface, no private
      // reach-in required.
      await vi.advanceTimersByTimeAsync(0);
      expect(pmsSyncService.syncReservations).toHaveBeenCalledTimes(1);
      const midFlight = scheduler.getStatus().jobs.find((j) => j.name === 'pms-sync');
      expect(midFlight?.isRunning).toBe(true);

      await scheduler.triggerJob('pms-sync');
      expect(pmsSyncService.syncReservations).toHaveBeenCalledTimes(1);

      // Let the in-flight run resolve so the scheduler can be torn down cleanly.
      resolveSync({ created: 0, updated: 0, unchanged: 0, errors: 0, errorDetails: [] });
      await vi.advanceTimersByTimeAsync(0);
    });

    it('manual triggers update lastRun/lastResult and write an activity_log row, same as a scheduled run', async () => {
      // triggerJob() now routes through the same wrappedHandler that scheduled runs use,
      // so manually-triggered runs are visible to getStatus() and the activity_log audit
      // trail exactly like scheduled runs of the same job.
      mockActivePMS();
      scheduler = new Scheduler();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const before = scheduler.getStatus().jobs.find((j) => j.name === 'pms-sync');
      const rowsBefore = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.eventType, 'scheduler.outcome'));

      // Advance the (fake) clock so the manual run's lastRun timestamp differs from the
      // immediate on-start run's timestamp.
      await vi.advanceTimersByTimeAsync(1000);
      await scheduler.triggerJob('pms-sync');

      const after = scheduler.getStatus().jobs.find((j) => j.name === 'pms-sync');
      const rowsAfter = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.eventType, 'scheduler.outcome'));

      expect(pmsSyncService.syncReservations).toHaveBeenCalledTimes(2); // once on start(), once manual
      expect(after?.lastRun).not.toBe(before?.lastRun); // updated by the manual run
      expect(after?.lastResult).toBe('success');
      expect(after?.isRunning).toBe(false);
      expect(rowsAfter.length).toBe(rowsBefore.length + 1); // new audit row for the manual run
    });
  });

  describe('getStatus', () => {
    it('reports intervalMs and null lastRun/lastResult before any run has completed', () => {
      mockNoPMS();
      scheduler = new Scheduler();
      // Do not call start() — jobs map is empty
      expect(scheduler.getStatus()).toEqual({ jobs: [] });
    });
  });
});
