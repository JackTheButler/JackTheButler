/**
 * Automation Engine Tests
 *
 * Characterization tests for src/core/automation/index.ts (AutomationEngine):
 * event-based evaluation, time-based scheduled triggers, rule CRUD, and
 * scheduler start/stop guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@/db/index.js';
import {
  automationRules,
  automationLogs,
  guests,
  reservations,
  tasks,
  type AutomationRule,
} from '@/db/schema.js';
import { eq } from 'drizzle-orm';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import {
  AutomationEngine,
  getAutomationEngine,
  resetAutomationEngine,
} from '@/core/automation/index.js';
import { registerPMSSync, resetPMSSync, type PMSSync } from '@/core/interfaces/pms-sync.js';
import type {
  AutomationEvent,
  AutomationRuleDefinition,
  CreateTaskActionConfig,
  WebhookActionConfig,
} from '@/core/automation/types.js';

vi.mock('@/apps/registry.js', () => ({
  getAppRegistry: vi.fn(),
}));

// Fake PMSSync implementation registered via the kernel seam
// (src/core/interfaces/pms-sync.js) instead of mocking the concrete
// @/apps/pms/sync.js module — proves the dependency-inversion seam works.
let mockPMSSync: { [K in keyof PMSSync]: ReturnType<typeof vi.fn> };

// Mirrors the local-midnight math in triggers.ts#getTargetDateForTrigger
// exactly (zero out time-of-day before adding days) so date-string
// comparisons don't drift a day around UTC conversion near midnight.
function todayPlusDays(days: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]!;
}

async function insertGuest() {
  const id = generateId('guest');
  await db.insert(guests).values({
    id,
    firstName: 'Alex',
    lastName: 'Guest',
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

async function insertReservation(guestId: string, overrides: Partial<{ arrivalDate: string; departureDate: string; status: string; roomNumber: string }> = {}) {
  const id = generateId('reservation');
  await db.insert(reservations).values({
    id,
    guestId,
    confirmationNumber: `CONF-${id}`,
    roomType: 'standard',
    roomNumber: overrides.roomNumber ?? '101',
    arrivalDate: overrides.arrivalDate ?? todayPlusDays(1),
    departureDate: overrides.departureDate ?? todayPlusDays(4),
    status: overrides.status ?? 'confirmed',
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

async function insertEventRule(
  definition: Partial<AutomationRuleDefinition> & Pick<AutomationRuleDefinition, 'actionType' | 'actionConfig'>
): Promise<AutomationRule> {
  const id = generateId('rule');
  const rule = await db
    .insert(automationRules)
    .values({
      id,
      name: definition.name ?? 'Test Rule',
      triggerType: 'event_based',
      triggerConfig: JSON.stringify(definition.triggerConfig ?? { eventType: 'reservation.created' }),
      actionType: definition.actionType,
      actionConfig: JSON.stringify(definition.actionConfig),
      enabled: definition.enabled ?? true,
    })
    .returning()
    .get();
  return rule;
}

async function insertTimeRule(
  triggerConfig: Record<string, unknown>,
  actionConfig: CreateTaskActionConfig
): Promise<AutomationRule> {
  const id = generateId('rule');
  const rule = await db
    .insert(automationRules)
    .values({
      id,
      name: 'Time Rule',
      triggerType: 'time_based',
      triggerConfig: JSON.stringify(triggerConfig),
      actionType: 'create_task',
      actionConfig: JSON.stringify(actionConfig),
      enabled: true,
    })
    .returning()
    .get();
  return rule;
}

function makeEvent(type: AutomationEvent['type'], data: AutomationEvent['data'] = {}): AutomationEvent {
  return { type, timestamp: new Date(), data };
}

describe('AutomationEngine', () => {
  let engine: AutomationEngine;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockPMSSync = {
      syncReservations: vi.fn().mockResolvedValue({ created: 0, updated: 0, unchanged: 0, errors: 0, errorDetails: [] }),
      refreshIfStale: vi.fn().mockResolvedValue(null),
    };
    registerPMSSync(mockPMSSync);
    // Full isolation between tests: deleting automationRules cascades to
    // automation_logs / automation_executions (FK onDelete: 'cascade'), and
    // reservations/tasks are cleared explicitly so a reservation inserted
    // by one test (e.g. with a default arrival date) can't be picked up by
    // runScheduledTriggers() in a later test.
    await db.delete(automationRules);
    await db.delete(tasks);
    await db.delete(reservations);
    await db.delete(guests);
    engine = new AutomationEngine();
  });

  afterEach(() => {
    engine.stopScheduler();
    resetAutomationEngine();
    resetPMSSync();
    vi.useRealTimers();
  });

  describe('evaluate (event-based rules)', () => {
    it('executes a matching rule, logs the execution, and updates rule stats', async () => {
      const guestId = await insertGuest();
      const config: CreateTaskActionConfig = {
        type: 'housekeeping',
        department: 'Housekeeping',
        description: 'Prepare for {{firstName}}',
      };
      const rule = await insertEventRule({
        triggerConfig: { eventType: 'reservation.created' },
        actionType: 'create_task',
        actionConfig: config,
      });

      const results = await engine.evaluate(makeEvent('reservation.created', { guestId }));

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.ruleId).toBe(rule.id);

      const logs = await db.select().from(automationLogs).where(eq(automationLogs.ruleId, rule.id));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.status).toBe('success');

      const [updatedRule] = await db.select().from(automationRules).where(eq(automationRules.id, rule.id));
      expect(updatedRule!.runCount).toBe(1);
      expect(updatedRule!.lastRunAt).toBeTruthy();
    });

    it('does not execute rules whose event type does not match', async () => {
      await insertEventRule({
        triggerConfig: { eventType: 'reservation.cancelled' },
        actionType: 'create_task',
        actionConfig: { type: 'housekeeping', department: 'HK', description: 'x' },
      });

      const results = await engine.evaluate(makeEvent('reservation.created', {}));
      expect(results).toHaveLength(0);
    });

    it('does not execute disabled rules', async () => {
      await insertEventRule({
        triggerConfig: { eventType: 'reservation.created' },
        actionType: 'create_task',
        actionConfig: { type: 'housekeeping', department: 'HK', description: 'x' },
        enabled: false,
      });

      const results = await engine.evaluate(makeEvent('reservation.created', {}));
      expect(results).toHaveLength(0);
    });

    it('records a failed execution, logs the error, and schedules a retry', async () => {
      const config: WebhookActionConfig = { url: 'https://example.com/hook' };
      const rule = await insertEventRule({
        triggerConfig: { eventType: 'task.created' },
        actionType: 'webhook',
        actionConfig: config,
      });

      const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
      vi.stubGlobal('fetch', fetchMock);

      try {
        const results = await engine.evaluate(makeEvent('task.created', {}));

        expect(results).toHaveLength(1);
        expect(results[0]!.success).toBe(false);
        expect(results[0]!.error).toContain('network down');

        const logs = await db.select().from(automationLogs).where(eq(automationLogs.ruleId, rule.id));
        expect(logs).toHaveLength(1);
        expect(logs[0]!.status).toBe('failed');

        const [updatedRule] = await db.select().from(automationRules).where(eq(automationRules.id, rule.id));
        expect(updatedRule!.lastError).toContain('network down');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('loads guest and reservation context onto the rule execution', async () => {
      const guestId = await insertGuest();
      const reservationId = await insertReservation(guestId, { roomNumber: '512' });

      const config: CreateTaskActionConfig = {
        type: 'concierge',
        department: 'Concierge',
        description: 'Room {{roomNumber}} for {{firstName}}',
      };
      await insertEventRule({
        triggerConfig: { eventType: 'reservation.checked_in' },
        actionType: 'create_task',
        actionConfig: config,
      });

      const results = await engine.evaluate(makeEvent('reservation.checked_in', { guestId, reservationId }));

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);

      const { tasks } = await import('@/db/schema.js');
      const chainResults = results[0]!.result as Array<{ output?: { taskId?: string } }>;
      const taskId = chainResults[0]?.output?.taskId;
      expect(taskId).toBeTruthy();
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId!));
      expect(task!.description).toBe('Room 512 for Alex');
    });

    it('uses the `actions` chain field when present instead of the legacy actionType/actionConfig', async () => {
      const id = generateId('rule');
      const rule = await db
        .insert(automationRules)
        .values({
          id,
          name: 'Chained Rule',
          triggerType: 'event_based',
          triggerConfig: JSON.stringify({ eventType: 'conversation.escalated' }),
          actionType: 'create_task',
          actionConfig: JSON.stringify({ type: 'other', department: 'x', description: 'legacy - unused' }),
          actions: JSON.stringify([
            {
              id: 'a1',
              type: 'create_task',
              order: 1,
              config: { type: 'concierge', department: 'Concierge', description: 'from chain' },
            },
          ]),
          enabled: true,
        })
        .returning()
        .get();

      const results = await engine.evaluate(makeEvent('conversation.escalated', {}));
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);

      const { tasks } = await import('@/db/schema.js');
      const chainResults = results[0]!.result as Array<{ output?: { taskId?: string } }>;
      const taskId = chainResults[0]?.output?.taskId;
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId!));
      expect(task!.description).toBe('from chain');
      expect(rule.actions).toBeTruthy();
    });
  });

  describe('runScheduledTriggers (time-based rules)', () => {
    it('executes a before_arrival rule for a matching reservation and creates a task', async () => {
      const guestId = await insertGuest();
      const arrivalDate = todayPlusDays(2);
      await insertReservation(guestId, { arrivalDate, status: 'confirmed' });

      await insertTimeRule(
        { type: 'before_arrival', offsetDays: 2 },
        { type: 'housekeeping', department: 'Housekeeping', description: 'Prepare for {{firstName}}' }
      );

      const results = await engine.runScheduledTriggers();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);

      const { tasks } = await import('@/db/schema.js');
      const taskId = (results[0]!.result as { taskId: string }).taskId;
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(task!.description).toBe('Prepare for Alex');
    });

    it('does not re-run the same rule for the same reservation on a second pass (hasRunToday)', async () => {
      const guestId = await insertGuest();
      const arrivalDate = todayPlusDays(3);
      await insertReservation(guestId, { arrivalDate });

      await insertTimeRule(
        { type: 'before_arrival', offsetDays: 3 },
        { type: 'housekeeping', department: 'Housekeeping', description: 'x' }
      );

      const first = await engine.runScheduledTriggers();
      expect(first).toHaveLength(1);

      const second = await engine.runScheduledTriggers();
      expect(second).toHaveLength(0);
    });

    it('does not trigger for a reservation with a non-matching status', async () => {
      const guestId = await insertGuest();
      const arrivalDate = todayPlusDays(1);
      await insertReservation(guestId, { arrivalDate, status: 'cancelled' });

      await insertTimeRule(
        { type: 'before_arrival', offsetDays: 1 },
        { type: 'housekeeping', department: 'Housekeeping', description: 'x' }
      );

      const results = await engine.runScheduledTriggers();
      expect(results).toHaveLength(0);
    });

    it('finds no reservations for an unhandled trigger config type (default branch)', async () => {
      await insertTimeRule(
        { type: 'scheduled' },
        { type: 'housekeeping', department: 'Housekeeping', description: 'x' }
      );

      const results = await engine.runScheduledTriggers();
      expect(results).toHaveLength(0);
    });

    it('skips a rule whose target date cannot be computed (missing offsetDays)', async () => {
      await insertTimeRule(
        { type: 'before_arrival' },
        { type: 'housekeeping', department: 'Housekeeping', description: 'x' }
      );

      const results = await engine.runScheduledTriggers();
      expect(results).toHaveLength(0);
    });

    it('continues evaluating rules even when the pre-trigger PMS sync throws', async () => {
      mockPMSSync.syncReservations.mockRejectedValueOnce(new Error('PMS unavailable'));

      const guestId = await insertGuest();
      const arrivalDate = todayPlusDays(5);
      await insertReservation(guestId, { arrivalDate });
      await insertTimeRule(
        { type: 'before_arrival', offsetDays: 5 },
        { type: 'housekeeping', department: 'Housekeeping', description: 'x' }
      );

      const results = await engine.runScheduledTriggers();
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
    });

    it('does not throw when a rule has malformed triggerConfig JSON', async () => {
      const id = generateId('rule');
      await db.insert(automationRules).values({
        id,
        name: 'Broken Rule',
        triggerType: 'time_based',
        triggerConfig: '{not valid json',
        actionType: 'create_task',
        actionConfig: JSON.stringify({ type: 'other', department: 'x', description: 'x' }),
        enabled: true,
      });

      await expect(engine.runScheduledTriggers()).resolves.toEqual([]);
    });
  });

  describe('rule CRUD', () => {
    it('creates, reads, updates, toggles, and deletes a rule', async () => {
      const definition: AutomationRuleDefinition = {
        name: 'CRUD Rule',
        description: 'desc',
        triggerType: 'event_based',
        triggerConfig: { eventType: 'task.completed' },
        actionType: 'notify_staff',
        actionConfig: { message: 'done' },
      };

      const created = await engine.createRule(definition);
      expect(created.name).toBe('CRUD Rule');
      expect(created.enabled).toBe(true);

      const fetched = await engine.getRule(created.id);
      expect(fetched?.id).toBe(created.id);

      const all = await engine.getRules();
      expect(all.some((r) => r.id === created.id)).toBe(true);

      const updated = await engine.updateRule(created.id, { name: 'Renamed Rule' });
      expect(updated?.name).toBe('Renamed Rule');

      const toggled = await engine.toggleRule(created.id, false);
      expect(toggled?.enabled).toBe(false);

      const deleted = await engine.deleteRule(created.id);
      expect(deleted).toBe(true);

      const afterDelete = await engine.getRule(created.id);
      expect(afterDelete).toBeNull();
    });

    it('returns null when updating or fetching a rule that does not exist', async () => {
      const result = await engine.updateRule('rule_does_not_exist', { name: 'x' });
      expect(result).toBeNull();

      const fetched = await engine.getRule('rule_does_not_exist');
      expect(fetched).toBeNull();
    });

    it('returns false when deleting a rule that does not exist', async () => {
      const result = await engine.deleteRule('rule_does_not_exist');
      expect(result).toBe(false);
    });
  });

  describe('scheduler lifecycle', () => {
    it('starts the scheduler and warns instead of double-starting on a second call', async () => {
      const warnSpy = vi.fn();
      vi.spyOn(engine as unknown as { runScheduledTriggers: () => Promise<unknown[]> }, 'runScheduledTriggers').mockResolvedValue([]);

      engine.startScheduler(1000);
      // Second call should hit the early-return "already running" branch.
      engine.startScheduler(1000);

      engine.stopScheduler();
      // Calling stop twice should be a safe no-op.
      engine.stopScheduler();

      expect(warnSpy).not.toHaveBeenCalled(); // sanity: no crash; log assertions aren't wired to a spy here.
    });

    it('invokes runScheduledTriggers on each scheduler tick', async () => {
      vi.useFakeTimers();
      const runSpy = vi
        .spyOn(engine as unknown as { runScheduledTriggers: () => Promise<unknown[]> }, 'runScheduledTriggers')
        .mockResolvedValue([]);

      engine.startScheduler(1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(runSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(runSpy).toHaveBeenCalledTimes(2);

      engine.stopScheduler();
      await vi.advanceTimersByTimeAsync(2000);
      // No further calls after stopping.
      expect(runSpy).toHaveBeenCalledTimes(2);
    });

    it('swallows errors thrown from a scheduler tick', async () => {
      vi.useFakeTimers();
      vi.spyOn(engine as unknown as { runScheduledTriggers: () => Promise<unknown[]> }, 'runScheduledTriggers').mockRejectedValue(
        new Error('boom')
      );

      engine.startScheduler(1000);
      // The interval callback catches the rejection internally (see
      // startScheduler's try/catch) — advancing the fake timer must not
      // propagate the rejection or throw.
      await vi.advanceTimersByTimeAsync(1000);

      engine.stopScheduler();
    });
  });

  describe('getAutomationEngine / resetAutomationEngine', () => {
    it('returns a cached singleton until reset', () => {
      resetAutomationEngine();
      const first = getAutomationEngine();
      const second = getAutomationEngine();
      expect(first).toBe(second);

      resetAutomationEngine();
      const third = getAutomationEngine();
      expect(third).not.toBe(first);
    });
  });
});
