/**
 * Automation Actions Tests
 *
 * Characterization tests for src/core/automation/actions.ts covering the
 * legacy per-type executors (executeAction) and the chain-executor entry
 * point (executeActionByType).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@/db/index.js';
import { automationRules, guests, type AutomationRule } from '@/db/schema.js';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import { events, EventTypes } from '@/events/index.js';
import {
  executeAction,
  executeActionByType,
  getAvailableTemplates,
} from '@/core/automation/actions.js';
import type {
  ExecutionContext,
  SendMessageActionConfig,
  CreateTaskActionConfig,
  NotifyStaffActionConfig,
  WebhookActionConfig,
  ActionType,
  ActionConfig,
} from '@/core/automation/types.js';

vi.mock('@/apps/registry.js', () => ({
  getAppRegistry: vi.fn(),
}));

async function insertRule(
  actionType: ActionType,
  actionConfig: ActionConfig,
  triggerConfig: Record<string, unknown> = { type: 'event_based' }
): Promise<AutomationRule> {
  const id = generateId('rule');
  const rule = await db
    .insert(automationRules)
    .values({
      id,
      name: 'Test Rule',
      triggerType: 'event_based',
      triggerConfig: JSON.stringify(triggerConfig),
      actionType,
      actionConfig: JSON.stringify(actionConfig),
      enabled: true,
    })
    .returning()
    .get();
  return rule;
}

// Note: the guest row's own phone/email columns are irrelevant to
// executeSendMessage() — it reads contact info from `context.guest`, which
// callers build independently. This helper only exists to satisfy the
// guests.id foreign key referenced by conversations.guestId, so phone/email
// just need to be unique per row (a fixed value would collide across tests).
let guestCounter = 0;
async function insertGuest(overrides: Partial<{ phone: string | null; email: string | null }> = {}) {
  const id = generateId('guest');
  guestCounter += 1;
  await db.insert(guests).values({
    id,
    firstName: 'Jane',
    lastName: 'Doe',
    phone: overrides.phone === undefined ? `+1555000${String(guestCounter).padStart(4, '0')}` : overrides.phone,
    email: overrides.email === undefined ? `jane.${guestCounter}@example.com` : overrides.email,
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

function baseContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    ruleId: 'rule_test',
    ruleName: 'Test Rule',
    ...overrides,
  };
}

describe('automation actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('executeAction dispatcher', () => {
    it('returns success:false for an unknown action type', async () => {
      const rule = await insertRule('send_message' as ActionType, { template: 'custom', message: 'x', channel: 'sms' });
      // Force an invalid actionType to hit the default branch of the switch.
      const badRule = { ...rule, actionType: 'not_a_real_type' } as unknown as AutomationRule;

      const result = await executeAction(badRule, baseContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type: not_a_real_type');
      expect(result.ruleId).toBe(rule.id);
      expect(typeof result.executionTimeMs).toBe('number');
    });

    it('wraps thrown errors from the executor into a failed ExecutionResult', async () => {
      const config: SendMessageActionConfig = { template: 'not_a_template', channel: 'sms' };
      const rule = await insertRule('send_message', config);
      const guestId = await insertGuest();

      const result = await executeAction(
        rule,
        baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' } })
      );

      expect(result.success).toBe(false);
      expect(result.actionType).toBe('send_message');
      expect(result.error).toContain('Unknown message template: not_a_template');
    });
  });

  describe('send_message action', () => {
    it('sends via the resolved channel adapter and persists the message', async () => {
      const guestId = await insertGuest();
      const config: SendMessageActionConfig = {
        template: 'custom',
        message: 'Hello {{firstName}}, room {{roomNumber}} is ready',
        channel: 'sms',
      };
      const rule = await insertRule('send_message', config);

      const sendMock = vi.fn().mockResolvedValue({ status: 'sent' });
      const { getAppRegistry } = await import('@/apps/registry.js');
      vi.mocked(getAppRegistry).mockReturnValue({
        getChannelAdapterByType: vi.fn().mockReturnValue({ send: sendMock }),
      } as never);

      const context = baseContext({
        guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' },
        reservation: { id: 'res_1', roomNumber: '204', arrivalDate: '2026-01-01', departureDate: '2026-01-05' },
      });

      const result = await executeAction(rule, context);

      expect(result.success).toBe(true);
      const output = result.result as { messageContent: string; channel: string; messageId: string; conversationId: string };
      expect(output.messageContent).toBe('Hello Jane, room 204 is ready');
      expect(output.channel).toBe('sms');
      expect(output.messageId).toBeTruthy();
      expect(output.conversationId).toBeTruthy();

      expect(sendMock).toHaveBeenCalledWith({
        conversationId: output.conversationId,
        channelId: '+15551234567',
        content: 'Hello Jane, room 204 is ready',
        contentType: 'text',
        metadata: { senderType: 'system' },
      });

      // Message actually persisted to the conversation.
      const { messages } = await import('@/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const stored = await db.select().from(messages).where(eq(messages.conversationId, output.conversationId));
      expect(stored).toHaveLength(1);
      expect(stored[0]!.content).toBe('Hello Jane, room 204 is ready');
      expect(stored[0]!.direction).toBe('outbound');
      expect(stored[0]!.senderType).toBe('system');
    });

    it('resolves "preferred" channel to whatsapp when guest has a phone', async () => {
      const guestId = await insertGuest({ email: null });
      const config: SendMessageActionConfig = { template: 'custom', message: 'Hi', channel: 'preferred' };
      const rule = await insertRule('send_message', config);

      const { getAppRegistry } = await import('@/apps/registry.js');
      vi.mocked(getAppRegistry).mockReturnValue({
        getChannelAdapterByType: vi.fn().mockReturnValue(undefined),
      } as never);

      const result = await executeAction(
        rule,
        baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' } })
      );

      expect(result.success).toBe(true);
      expect((result.result as { channel: string }).channel).toBe('whatsapp');
    });

    it('resolves "preferred" channel to email when only email is available', async () => {
      const guestId = await insertGuest({ phone: null });
      const config: SendMessageActionConfig = { template: 'custom', message: 'Hi', channel: 'preferred' };
      const rule = await insertRule('send_message', config);

      const { getAppRegistry } = await import('@/apps/registry.js');
      vi.mocked(getAppRegistry).mockReturnValue({
        getChannelAdapterByType: vi.fn().mockReturnValue(undefined),
      } as never);

      const result = await executeAction(
        rule,
        baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' } })
      );

      expect(result.success).toBe(true);
      expect((result.result as { channel: string }).channel).toBe('email');
    });

    it('falls back to "sms" for preferred channel when guest has neither phone nor email, then fails on missing contact info', async () => {
      const guestId = await insertGuest({ phone: null, email: null });
      const config: SendMessageActionConfig = { template: 'custom', message: 'Hi', channel: 'preferred' };
      const rule = await insertRule('send_message', config);

      const result = await executeAction(
        rule,
        baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe' } })
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No contact info available for channel: sms');
    });

    it('fails with ValidationError when the requested template is unknown', async () => {
      const guestId = await insertGuest();
      const config: SendMessageActionConfig = { template: 'does_not_exist', channel: 'sms' };
      const rule = await insertRule('send_message', config);

      const result = await executeAction(
        rule,
        baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' } })
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown message template: does_not_exist');
    });

    it('uses the built-in pre_arrival_welcome template with variable substitution', async () => {
      const guestId = await insertGuest();
      const config: SendMessageActionConfig = { template: 'pre_arrival_welcome', channel: 'sms' };
      const rule = await insertRule('send_message', config);

      const { getAppRegistry } = await import('@/apps/registry.js');
      vi.mocked(getAppRegistry).mockReturnValue({
        getChannelAdapterByType: vi.fn().mockReturnValue(undefined),
      } as never);

      const result = await executeAction(
        rule,
        baseContext({
          guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' },
          reservation: { id: 'res_1', arrivalDate: '2026-01-01', departureDate: '2026-01-05' },
        })
      );

      expect(result.success).toBe(true);
      const content = (result.result as { messageContent: string }).messageContent;
      expect(content).toContain('Hello Jane!');
      expect(content).toContain('2026-01-01');
    });

    it('fails when there is no contact info for the requested channel', async () => {
      const guestId = await insertGuest({ email: null });
      const config: SendMessageActionConfig = { template: 'custom', message: 'Hi', channel: 'email' };
      const rule = await insertRule('send_message', config);

      const result = await executeAction(
        rule,
        baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', email: undefined } })
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No contact info available for channel: email');
    });

    it('saves the message but does not throw when the channel adapter is unavailable', async () => {
      const guestId = await insertGuest();
      const config: SendMessageActionConfig = { template: 'custom', message: 'Hi', channel: 'sms' };
      const rule = await insertRule('send_message', config);

      const { getAppRegistry } = await import('@/apps/registry.js');
      vi.mocked(getAppRegistry).mockReturnValue({
        getChannelAdapterByType: vi.fn().mockReturnValue(undefined),
      } as never);

      const result = await executeAction(
        rule,
        baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' } })
      );

      expect(result.success).toBe(true);
      expect((result.result as { messageId: string }).messageId).toBeTruthy();
    });

    it('saves the message but does not fail the action when the adapter.send() throws', async () => {
      const guestId = await insertGuest();
      const config: SendMessageActionConfig = { template: 'custom', message: 'Hi', channel: 'sms' };
      const rule = await insertRule('send_message', config);

      const { getAppRegistry } = await import('@/apps/registry.js');
      vi.mocked(getAppRegistry).mockReturnValue({
        getChannelAdapterByType: vi.fn().mockReturnValue({
          send: vi.fn().mockRejectedValue(new Error('channel down')),
        }),
      } as never);

      const result = await executeAction(
        rule,
        baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' } })
      );

      // Delivery failure is swallowed - the action itself is still a success
      // because the message was persisted. This is current (perhaps
      // surprising) behavior: callers cannot distinguish "sent" from
      // "saved but undelivered" from the ExecutionResult alone.
      expect(result.success).toBe(true);
    });

    // NOTE (suspected dead code / bug): executeSendMessage computes
    // `channelId` from `context.guest?.email` / `context.guest?.phone`
    // *before* checking `if (!context.guest)`. Since channelId can only be
    // truthy when context.guest exists, the "Guest context required to send
    // message" ValidationError branch is unreachable in practice — the
    // "No contact info available" error always fires first when guest is
    // missing. Documented here as characterization, not fixed.
  });

  describe('create_task action', () => {
    it('creates a task with variables substituted into the description', async () => {
      const config: CreateTaskActionConfig = {
        type: 'housekeeping',
        department: 'Housekeeping',
        description: 'Prepare room {{roomNumber}} for {{firstName}} {{lastName}} arriving {{arrivalDate}}',
        priority: 'high',
      };
      const rule = await insertRule('create_task', config);

      const context = baseContext({
        guest: { id: 'guest_1', firstName: 'Jane', lastName: 'Doe' },
        reservation: { id: 'res_1', roomNumber: '204', arrivalDate: '2026-01-01', departureDate: '2026-01-05' },
      });

      const result = await executeAction(rule, context);

      expect(result.success).toBe(true);
      const taskId = (result.result as { taskId: string }).taskId;
      expect(taskId).toBeTruthy();

      const { tasks } = await import('@/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(task).toBeDefined();
      expect(task!.description).toBe('Prepare room 204 for Jane Doe arriving 2026-01-01');
      expect(task!.type).toBe('housekeeping');
      expect(task!.priority).toBe('high');
      expect(task!.department).toBe('Housekeeping');
      expect(task!.roomNumber).toBe('204');
      expect(task!.source).toBe('automation');
    });

    it('defaults an invalid task type to "other"', async () => {
      const config: CreateTaskActionConfig = {
        type: 'not_a_real_type',
        department: 'Front Desk',
        description: 'Do something',
      };
      const rule = await insertRule('create_task', config);

      const result = await executeAction(rule, baseContext());
      expect(result.success).toBe(true);

      const { tasks } = await import('@/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const taskId = (result.result as { taskId: string }).taskId;
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(task!.type).toBe('other');
    });

    it('defaults an invalid priority to "standard"', async () => {
      const config: CreateTaskActionConfig = {
        type: 'maintenance',
        department: 'Engineering',
        description: 'Fix the sink',
        priority: 'super-urgent' as CreateTaskActionConfig['priority'],
      };
      const rule = await insertRule('create_task', config);

      const result = await executeAction(rule, baseContext());
      expect(result.success).toBe(true);

      const { tasks } = await import('@/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const taskId = (result.result as { taskId: string }).taskId;
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(task!.priority).toBe('standard');
    });

    it('replaces ruleId/ruleName variables in the description', async () => {
      const config: CreateTaskActionConfig = {
        type: 'concierge',
        department: 'Concierge',
        description: 'Triggered by rule {{ruleName}} ({{ruleId}})',
      };
      const rule = await insertRule('create_task', config);

      const result = await executeAction(rule, baseContext({ ruleId: 'rule_abc', ruleName: 'Welcome Flow' }));
      expect(result.success).toBe(true);

      const { tasks } = await import('@/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const taskId = (result.result as { taskId: string }).taskId;
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(task!.description).toBe('Triggered by rule Welcome Flow (rule_abc)');
    });
  });

  describe('notify_staff action', () => {
    it('emits a STAFF_NOTIFICATION event with role and message substituted', async () => {
      const config: NotifyStaffActionConfig = {
        role: 'manager',
        message: 'Guest {{firstName}} needs help in room {{roomNumber}}',
        priority: 'urgent',
      };
      const rule = await insertRule('notify_staff', config);

      const received: unknown[] = [];
      const handler = (event: unknown) => received.push(event);
      events.on(EventTypes.STAFF_NOTIFICATION, handler as never);

      try {
        const result = await executeAction(
          rule,
          baseContext({
            guest: { id: 'guest_1', firstName: 'Jane', lastName: 'Doe' },
            reservation: { id: 'res_1', roomNumber: '305', arrivalDate: '2026-01-01', departureDate: '2026-01-05' },
            ruleId: 'rule_1',
          })
        );

        expect(result.success).toBe(true);
        const output = result.result as { notificationSent: boolean; notificationId: string };
        expect(output.notificationSent).toBe(true);
        expect(output.notificationId).toBeTruthy();

        expect(received).toHaveLength(1);
        const payload = (received[0] as { payload: Record<string, unknown> }).payload;
        expect(payload.message).toBe('Guest Jane needs help in room 305');
        expect(payload.priority).toBe('urgent');
        expect(payload.role).toBe('manager');
        expect(payload.automationRuleId).toBe('rule_1');
        expect(payload.staffId).toBeUndefined();
      } finally {
        events.off(EventTypes.STAFF_NOTIFICATION, handler as never);
      }
    });

    it('defaults an invalid priority to "standard" and omits role/staffId when absent', async () => {
      const config: NotifyStaffActionConfig = {
        message: 'Something happened',
        priority: 'super-urgent' as NotifyStaffActionConfig['priority'],
      };
      const rule = await insertRule('notify_staff', config);

      const received: unknown[] = [];
      const handler = (event: unknown) => received.push(event);
      events.on(EventTypes.STAFF_NOTIFICATION, handler as never);

      try {
        const result = await executeAction(rule, baseContext({ ruleId: '' }));
        expect(result.success).toBe(true);

        const payload = (received[0] as { payload: Record<string, unknown> }).payload;
        expect(payload.priority).toBe('standard');
        expect(payload.role).toBeUndefined();
        expect(payload.staffId).toBeUndefined();
      } finally {
        events.off(EventTypes.STAFF_NOTIFICATION, handler as never);
      }
    });

    it('includes staffId in the payload when targeting a specific staff member', async () => {
      const config: NotifyStaffActionConfig = { staffId: 'staff_42', message: 'Ping' };
      const rule = await insertRule('notify_staff', config);

      const received: unknown[] = [];
      const handler = (event: unknown) => received.push(event);
      events.on(EventTypes.STAFF_NOTIFICATION, handler as never);

      try {
        await executeAction(rule, baseContext());
        const payload = (received[0] as { payload: Record<string, unknown> }).payload;
        expect(payload.staffId).toBe('staff_42');
      } finally {
        events.off(EventTypes.STAFF_NOTIFICATION, handler as never);
      }
    });
  });

  describe('webhook action', () => {
    it('POSTs to the configured URL and returns the parsed JSON response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ received: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const config: WebhookActionConfig = {
        url: 'https://example.com/hook',
        bodyTemplate: JSON.stringify({ rule: '{{ruleId}}', name: '{{ruleName}}', guest: '{{firstName}} {{lastName}}' }),
      };
      const rule = await insertRule('webhook', config);

      const result = await executeAction(
        rule,
        baseContext({
          ruleId: 'rule_xyz',
          ruleName: 'My Rule',
          guest: { id: 'guest_1', firstName: 'Jane', lastName: 'Doe' },
          reservation: { id: 'res_9', arrivalDate: '2026-01-01', departureDate: '2026-01-05' },
        })
      );

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://example.com/hook');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body as string)).toEqual({
        rule: 'rule_xyz',
        name: 'My Rule',
        guest: 'Jane Doe',
      });

      expect((result.result as { status: number }).status).toBe(200);
      expect((result.result as { response: unknown }).response).toEqual({ received: true });
    });

    it('substitutes {{reservationId}} in the body template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });
      vi.stubGlobal('fetch', fetchMock);

      const config: WebhookActionConfig = {
        url: 'https://example.com/hook',
        bodyTemplate: JSON.stringify({ reservationId: '{{reservationId}}' }),
      };
      const rule = await insertRule('webhook', config);

      await executeAction(
        rule,
        baseContext({ reservation: { id: 'res_777', arrivalDate: '2026-01-01', departureDate: '2026-01-05' } })
      );

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({ reservationId: 'res_777' });
    });

    it('falls back to text() when the response body is not valid JSON', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('not json')),
        text: vi.fn().mockResolvedValue('plain text body'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const config: WebhookActionConfig = { url: 'https://example.com/hook' };
      const rule = await insertRule('webhook', config);

      const result = await executeAction(rule, baseContext());

      expect(result.success).toBe(true);
      expect((result.result as { response: unknown }).response).toBe('plain text body');
    });

    it('respects a custom method and merges custom headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });
      vi.stubGlobal('fetch', fetchMock);

      const config: WebhookActionConfig = {
        url: 'https://example.com/hook',
        method: 'GET',
        headers: { 'X-Api-Key': 'secret' },
      };
      const rule = await insertRule('webhook', config);

      await executeAction(rule, baseContext());

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe('GET');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-Api-Key': 'secret' });
      expect(options.body).toBeUndefined();
    });

    it('fails the action when the webhook responds with a non-2xx status', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'boom' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const config: WebhookActionConfig = { url: 'https://example.com/hook' };
      const rule = await insertRule('webhook', config);

      const result = await executeAction(rule, baseContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook failed: Webhook returned status 500');
    });

    it('fails the action when fetch itself rejects (network error)', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', fetchMock);

      const config: WebhookActionConfig = { url: 'https://example.com/hook' };
      const rule = await insertRule('webhook', config);

      const result = await executeAction(rule, baseContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook failed: ECONNREFUSED');
    });
  });

  describe('getAvailableTemplates', () => {
    it('lists the built-in message template names', () => {
      const templates = getAvailableTemplates();
      expect(templates).toEqual(
        expect.arrayContaining(['pre_arrival_welcome', 'checkout_reminder', 'post_stay_thank_you'])
      );
      expect(templates).toHaveLength(3);
    });
  });

  describe('executeActionByType (chain executor entry point)', () => {
    it('dispatches send_message and persists the message directly (no rule row involved)', async () => {
      const guestId = await insertGuest();
      const { getAppRegistry } = await import('@/apps/registry.js');
      vi.mocked(getAppRegistry).mockReturnValue({
        getChannelAdapterByType: vi.fn().mockReturnValue(undefined),
      } as never);

      const config: SendMessageActionConfig = { template: 'custom', message: 'Direct hi', channel: 'sms' };
      const context = baseContext({ guest: { id: guestId, firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' } });

      const output = (await executeActionByType('send_message', config, context)) as {
        messageContent: string;
        conversationId: string;
      };

      expect(output.messageContent).toBe('Direct hi');
      expect(output.conversationId).toBeTruthy();
    });

    it('dispatches create_task directly', async () => {
      const config: CreateTaskActionConfig = {
        type: 'room_service',
        department: 'F&B',
        description: 'Bring water',
      };
      const output = (await executeActionByType('create_task', config, baseContext())) as { taskId: string };
      expect(output.taskId).toBeTruthy();
    });

    it('dispatches notify_staff directly', async () => {
      const config: NotifyStaffActionConfig = { message: 'Direct notify' };
      const received: unknown[] = [];
      const handler = (event: unknown) => received.push(event);
      events.on(EventTypes.STAFF_NOTIFICATION, handler as never);

      try {
        const output = (await executeActionByType('notify_staff', config, baseContext())) as {
          notificationSent: boolean;
        };
        expect(output.notificationSent).toBe(true);
        expect(received).toHaveLength(1);
      } finally {
        events.off(EventTypes.STAFF_NOTIFICATION, handler as never);
      }
    });

    it('dispatches webhook directly', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ ok: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const config: WebhookActionConfig = { url: 'https://example.com/direct' };
      const output = (await executeActionByType('webhook', config, baseContext())) as { status: number };
      expect(output.status).toBe(201);
    });

    it('throws ValidationError for an unknown action type', async () => {
      await expect(
        executeActionByType('bogus' as ActionType, {} as ActionConfig, baseContext())
      ).rejects.toThrow('Unknown action type: bogus');
    });
  });
});
