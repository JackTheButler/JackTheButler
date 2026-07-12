/**
 * Automation API Tests
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff } from '@/db/index.js';
import { automationRules, automationLogs } from '@/db/schema.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { AuthService } from '@/auth/auth.js';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';

// Mock the app registry so the /generate route (which asks for a completion
// AI provider) never makes real network calls. We mock the underlying
// registry module (not the '@/apps/index.js' barrel) so unrelated exports
// used elsewhere while building `app` (tool routes, loaders, etc.) keep
// working — see tests/core/memory-event-subscriber.test.ts for the same
// pattern.
vi.mock('@/apps/registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/apps/registry.js')>();
  return {
    ...actual,
    getAppRegistry: vi.fn(),
  };
});

import { getAppRegistry } from '@/apps/registry.js';

const mockedGetAppRegistry = vi.mocked(getAppRegistry);

function makeMockProvider(completionContent: string) {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({ content: completionContent, usage: { inputTokens: 10, outputTokens: 20 } }),
    embed: vi.fn(),
  };
}

describe('Automation API', () => {
  const authService = new AuthService();

  const adminUserId = 'staff-automation-admin';
  const staffUserId = 'staff-automation-staff';

  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));

    const passwordHash = await authService.hashPassword('test123');
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'automation-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: staffUserId,
        email: 'automation-staff@test.com',
        name: 'Staff User',
        roleId: SYSTEM_ROLE_IDS.STAFF, // lacks AUTOMATIONS_VIEW / AUTOMATIONS_MANAGE
        status: 'active',
        passwordHash,
      },
    ]);

    const adminTokens = await authService.login('automation-admin@test.com', 'test123');
    const staffTokens = await authService.login('automation-staff@test.com', 'test123');

    adminToken = adminTokens.accessToken;
    staffToken = staffTokens.accessToken;
  });

  afterAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
  });

  afterEach(async () => {
    // Clean up any rules created during tests to avoid cross-test pollution
    await db.delete(automationRules).where(eq(automationRules.name, 'Test Rule'));
    await db.delete(automationRules).where(eq(automationRules.name, 'Updated Rule'));
    vi.mocked(getAppRegistry).mockReset();
  });

  function validRuleBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Test Rule',
      description: 'A rule created by tests',
      triggerType: 'time_based',
      triggerConfig: { type: 'before_arrival', offsetDays: 1, time: '09:00' },
      actionType: 'send_message',
      actionConfig: { template: 'pre_arrival_welcome', channel: 'preferred' },
      ...overrides,
    };
  }

  async function createRule(overrides: Record<string, unknown> = {}) {
    const res = await app.request('/api/v1/automation/rules', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(validRuleBody(overrides)),
    });
    expect(res.status).toBe(201);
    return res.json();
  }

  // ==================
  // GET /rules
  // ==================
  describe('GET /api/v1/automation/rules', () => {
    it('returns 401 without authentication', async () => {
      const res = await app.request('/api/v1/automation/rules');
      expect(res.status).toBe(401);
    });

    it('returns 403 for a role without AUTOMATIONS_VIEW', async () => {
      const res = await app.request('/api/v1/automation/rules', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('lists rules with parsed trigger/action config', async () => {
      const created = await createRule();

      const res = await app.request('/api/v1/automation/rules', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.rules)).toBe(true);
      const found = json.rules.find((r: { id: string }) => r.id === created.id);
      expect(found).toBeDefined();
      expect(found.triggerConfig).toEqual({ type: 'before_arrival', offsetDays: 1, time: '09:00' });
      expect(found.actionConfig).toEqual({ template: 'pre_arrival_welcome', channel: 'preferred' });
      expect(found.runCount).toBe(0);
    });
  });

  // ==================
  // GET /templates
  // ==================
  describe('GET /api/v1/automation/templates', () => {
    it('returns available templates with humanized names', async () => {
      const res = await app.request('/api/v1/automation/templates', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.templates)).toBe(true);
      expect(json.templates.length).toBeGreaterThan(0);
      const preArrival = json.templates.find((t: { id: string }) => t.id === 'pre_arrival_welcome');
      expect(preArrival).toBeDefined();
      expect(preArrival.name).toBe('Pre Arrival Welcome');
    });

    it('returns 403 for a role without AUTOMATIONS_VIEW', async () => {
      const res = await app.request('/api/v1/automation/templates', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // GET /rules/:ruleId
  // ==================
  describe('GET /api/v1/automation/rules/:ruleId', () => {
    it('returns a specific rule', async () => {
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe(created.id);
      expect(json.name).toBe('Test Rule');
      expect(json.triggerConfig).toEqual({ type: 'before_arrival', offsetDays: 1, time: '09:00' });
    });

    it('returns 404 for a non-existent rule', async () => {
      const res = await app.request('/api/v1/automation/rules/nonexistent-rule', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });
  });

  // ==================
  // POST /rules
  // ==================
  describe('POST /api/v1/automation/rules', () => {
    it('creates a new rule', async () => {
      const res = await app.request('/api/v1/automation/rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(validRuleBody()),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBeDefined();
      expect(json.name).toBe('Test Rule');
      expect(json.enabled).toBe(true);
      expect(json.triggerConfig).toEqual({ type: 'before_arrival', offsetDays: 1, time: '09:00' });
    });

    it('defaults enabled to true when omitted', async () => {
      const json = await createRule();
      expect(json.enabled).toBe(true);
    });

    it('rejects an invalid trigger type', async () => {
      const res = await app.request('/api/v1/automation/rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(validRuleBody({ triggerType: 'not_a_real_type' })),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid request body');
      expect(json.details).toBeDefined();
    });

    it('rejects a missing name', async () => {
      const body = validRuleBody();
      delete (body as Record<string, unknown>).name;
      const res = await app.request('/api/v1/automation/rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    });

    it('returns 403 for a role without AUTOMATIONS_MANAGE', async () => {
      const res = await app.request('/api/v1/automation/rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(validRuleBody()),
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // PUT /rules/:ruleId
  // ==================
  describe('PUT /api/v1/automation/rules/:ruleId', () => {
    it('updates an existing rule', async () => {
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Rule', enabled: false }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe('Updated Rule');
      expect(json.enabled).toBe(false);
    });

    it('returns 404 for a non-existent rule', async () => {
      const res = await app.request('/api/v1/automation/rules/nonexistent-rule', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Whatever' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects an invalid body', async () => {
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'not_a_real_action' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 403 for a role without AUTOMATIONS_MANAGE', async () => {
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Should Not Update' }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // DELETE /rules/:ruleId
  // ==================
  describe('DELETE /api/v1/automation/rules/:ruleId', () => {
    it('deletes an existing rule', async () => {
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const getRes = await app.request(`/api/v1/automation/rules/${created.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for a non-existent rule', async () => {
      const res = await app.request('/api/v1/automation/rules/nonexistent-rule', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 for a role without AUTOMATIONS_MANAGE', async () => {
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // POST /rules/:ruleId/toggle
  // ==================
  describe('POST /api/v1/automation/rules/:ruleId/toggle', () => {
    it('enables and disables a rule', async () => {
      const created = await createRule();

      const disableRes = await app.request(`/api/v1/automation/rules/${created.id}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      expect(disableRes.status).toBe(200);
      expect((await disableRes.json()).enabled).toBe(false);

      const enableRes = await app.request(`/api/v1/automation/rules/${created.id}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(enableRes.status).toBe(200);
      expect((await enableRes.json()).enabled).toBe(true);
    });

    it('treats a non-boolean-true "enabled" value as false', async () => {
      // Characterization: `body.enabled === true` is a strict check, so any
      // truthy-but-not-boolean value (e.g. the string "true") is treated as false.
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 'true' }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).enabled).toBe(false);
    });

    it('returns 404 for a non-existent rule', async () => {
      const res = await app.request('/api/v1/automation/rules/nonexistent-rule/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 for a role without AUTOMATIONS_MANAGE', async () => {
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ==================
  // GET /rules/:ruleId/logs
  // ==================
  describe('GET /api/v1/automation/rules/:ruleId/logs', () => {
    it('returns execution logs for a rule', async () => {
      const created = await createRule();
      const logId = generateId('alog');

      await db.insert(automationLogs).values({
        id: logId,
        ruleId: created.id,
        status: 'success',
        triggerData: JSON.stringify({ event: 'reservation.created' }),
        actionResult: JSON.stringify({ sent: true }),
        executionTimeMs: 42,
        createdAt: now(),
      });

      const res = await app.request(`/api/v1/automation/rules/${created.id}/logs`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.logs.length).toBe(1);
      expect(json.logs[0].id).toBe(logId);
      expect(json.logs[0].triggerData).toEqual({ event: 'reservation.created' });
      expect(json.logs[0].actionResult).toEqual({ sent: true });
      expect(json.logs[0].executionTimeMs).toBe(42);

      await db.delete(automationLogs).where(eq(automationLogs.id, logId));
    });

    it('returns 404 for a non-existent rule', async () => {
      const res = await app.request('/api/v1/automation/rules/nonexistent-rule/logs', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });
  });

  // ==================
  // GET /logs
  // ==================
  describe('GET /api/v1/automation/logs', () => {
    it('returns all logs across rules, filterable by status', async () => {
      const created = await createRule();
      const successLogId = generateId('alog');
      const failedLogId = generateId('alog');

      await db.insert(automationLogs).values([
        {
          id: successLogId,
          ruleId: created.id,
          status: 'success',
          createdAt: now(),
        },
        {
          id: failedLogId,
          ruleId: created.id,
          status: 'failed',
          errorMessage: 'boom',
          createdAt: now(),
        },
      ]);

      const allRes = await app.request('/api/v1/automation/logs', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(allRes.status).toBe(200);
      const allJson = await allRes.json();
      const ids = allJson.logs.map((l: { id: string }) => l.id);
      expect(ids).toContain(successLogId);
      expect(ids).toContain(failedLogId);

      const failedRes = await app.request('/api/v1/automation/logs?status=failed', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const failedJson = await failedRes.json();
      expect(failedJson.logs.every((l: { status: string }) => l.status === 'failed')).toBe(true);
      expect(failedJson.logs.some((l: { id: string }) => l.id === failedLogId)).toBe(true);

      await db.delete(automationLogs).where(eq(automationLogs.id, successLogId));
      await db.delete(automationLogs).where(eq(automationLogs.id, failedLogId));
    });

    it('ignores an unrecognized status filter and returns all logs', async () => {
      // Characterization: only 'success'/'failed' are recognized filters;
      // any other value (e.g. 'skipped') silently falls through to "no filter".
      const res = await app.request('/api/v1/automation/logs?status=skipped', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
    });
  });

  // ==================
  // POST /rules/:ruleId/test
  // ==================
  describe('POST /api/v1/automation/rules/:ruleId/test', () => {
    it('validates a well-formed rule', async () => {
      const created = await createRule();

      const res = await app.request(`/api/v1/automation/rules/${created.id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.details.triggerType).toBe('time_based');
    });

    it('reports invalid time-based trigger config', async () => {
      const created = await createRule({ triggerConfig: {} });

      const res = await app.request(`/api/v1/automation/rules/${created.id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Time-based trigger missing type');
    });

    it('reports an unknown message template', async () => {
      const created = await createRule({ actionConfig: { template: 'not_a_real_template' } });

      const res = await app.request(`/api/v1/automation/rules/${created.id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unknown template');
    });

    it('reports a missing webhook URL', async () => {
      const created = await createRule({ actionType: 'webhook', actionConfig: {} });

      const res = await app.request(`/api/v1/automation/rules/${created.id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Webhook action missing URL');
    });

    it('returns 404 for a non-existent rule', async () => {
      const res = await app.request('/api/v1/automation/rules/nonexistent-rule/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });
  });

  // ==================
  // POST /generate
  // ==================
  describe('POST /api/v1/automation/generate', () => {
    it('rejects a prompt that is too short', async () => {
      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'short' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 503 when no AI provider is available', async () => {
      mockedGetAppRegistry.mockReturnValue({
        getCompletionProvider: () => undefined,
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Send a welcome message three days before arrival' }),
      });

      expect(res.status).toBe(503);
    });

    it('generates a rule from a well-formed AI response, assigning missing action ids', async () => {
      const aiResponse = JSON.stringify({
        name: 'AI Generated Rule',
        description: 'Generated from prompt',
        triggerType: 'time_based',
        triggerConfig: { type: 'before_arrival', offsetDays: 3, time: '09:00' },
        actionType: 'send_message',
        actionConfig: { template: 'pre_arrival_welcome', channel: 'preferred' },
      });
      mockedGetAppRegistry.mockReturnValue({
        getCompletionProvider: () => makeMockProvider(aiResponse),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Send a welcome message three days before arrival' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rule.name).toBe('AI Generated Rule');
      // Legacy actionType/actionConfig gets converted into a chained action with a generated id
      expect(json.rule.actions).toHaveLength(1);
      expect(json.rule.actions[0].id).toBeDefined();
      expect(json.rule.actions[0].type).toBe('send_message');
    });

    it('strips markdown code fences from the AI response', async () => {
      const aiResponse =
        '```json\n' +
        JSON.stringify({
          name: 'Fenced Rule',
          triggerType: 'event_based',
          triggerConfig: { eventType: 'reservation.created' },
          actionType: 'notify_staff',
          actionConfig: { message: 'New booking' },
        }) +
        '\n```';
      mockedGetAppRegistry.mockReturnValue({
        getCompletionProvider: () => makeMockProvider(aiResponse),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Notify staff whenever a reservation is created' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rule.name).toBe('Fenced Rule');
    });

    it('returns 422 when the AI response is not valid JSON', async () => {
      mockedGetAppRegistry.mockReturnValue({
        getCompletionProvider: () => makeMockProvider('this is not json'),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Notify staff whenever a reservation is created' }),
      });

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toBe('Failed to parse generated rule');
      expect(json.raw).toBe('this is not json');
    });

    it('returns 422 when the AI response is missing required fields', async () => {
      mockedGetAppRegistry.mockReturnValue({
        getCompletionProvider: () => makeMockProvider(JSON.stringify({ description: 'no name or trigger' })),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Notify staff whenever a reservation is created' }),
      });

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toBe('Invalid generated rule');
    });

    it('assigns ids to chained actions that are missing one', async () => {
      const aiResponse = JSON.stringify({
        name: 'Chained Rule',
        triggerType: 'event_based',
        triggerConfig: { eventType: 'reservation.checked_in' },
        actions: [
          { type: 'send_message', config: { template: 'pre_arrival_welcome' }, order: 1 },
        ],
      });
      mockedGetAppRegistry.mockReturnValue({
        getCompletionProvider: () => makeMockProvider(aiResponse),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Send a welcome message on check-in' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rule.actions[0].id).toBeDefined();
    });

    it('returns 500 when the AI provider call throws', async () => {
      mockedGetAppRegistry.mockReturnValue({
        getCompletionProvider: () => ({
          name: 'mock',
          complete: vi.fn().mockRejectedValue(new Error('provider unavailable')),
          embed: vi.fn(),
        }),
      } as unknown as ReturnType<typeof getAppRegistry>);

      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Notify staff whenever a reservation is created' }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to generate rule');
      expect(json.details).toBe('provider unavailable');
    });

    it('returns 403 for a role without AUTOMATIONS_MANAGE', async () => {
      const res = await app.request('/api/v1/automation/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Notify staff whenever a reservation is created' }),
      });
      expect(res.status).toBe(403);
    });
  });
});
