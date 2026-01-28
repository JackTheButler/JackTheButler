/**
 * Automation Management API Routes
 *
 * Endpoints for managing automation rules.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { automationLogs } from '@/db/schema.js';
import {
  getAutomationEngine,
  getAvailableTemplates,
  type AutomationRuleDefinition,
  type TriggerType,
  type ActionType,
  type TriggerConfig,
  type ActionConfig,
} from '@/automation/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('api:automation');

/**
 * Automation routes
 */
export const automationRoutes = new Hono();

// ==================
// List Rules
// ==================

/**
 * GET /api/v1/automation/rules
 * List all automation rules
 */
automationRoutes.get('/rules', async (c) => {
  const engine = getAutomationEngine();
  const rules = await engine.getRules();

  // Transform for API response
  const response = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    triggerType: rule.triggerType,
    triggerConfig: JSON.parse(rule.triggerConfig),
    actionType: rule.actionType,
    actionConfig: JSON.parse(rule.actionConfig),
    enabled: rule.enabled,
    runCount: rule.runCount || 0,
    lastRunAt: rule.lastRunAt,
    lastError: rule.lastError,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }));

  return c.json({ rules: response });
});

// ==================
// Get Templates
// ==================

/**
 * GET /api/v1/automation/templates
 * Get available message templates
 */
automationRoutes.get('/templates', async (c) => {
  const templates = getAvailableTemplates();

  return c.json({
    templates: templates.map((name) => ({
      id: name,
      name: name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    })),
  });
});

// ==================
// Get Rule
// ==================

/**
 * GET /api/v1/automation/rules/:ruleId
 * Get a specific rule
 */
automationRoutes.get('/rules/:ruleId', async (c) => {
  const { ruleId } = c.req.param();

  const engine = getAutomationEngine();
  const rule = await engine.getRule(ruleId);

  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  return c.json({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    triggerType: rule.triggerType,
    triggerConfig: JSON.parse(rule.triggerConfig),
    actionType: rule.actionType,
    actionConfig: JSON.parse(rule.actionConfig),
    enabled: rule.enabled,
    runCount: rule.runCount || 0,
    lastRunAt: rule.lastRunAt,
    lastError: rule.lastError,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  });
});

// ==================
// Create Rule
// ==================

const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  triggerType: z.enum(['time_based', 'event_based']),
  triggerConfig: z.record(z.string(), z.unknown()),
  actionType: z.enum(['send_message', 'create_task', 'notify_staff', 'webhook']),
  actionConfig: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional(),
});

/**
 * POST /api/v1/automation/rules
 * Create a new automation rule
 */
automationRoutes.post('/rules', async (c) => {
  const body = await c.req.json();
  const parsed = createRuleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
  }

  const engine = getAutomationEngine();
  const definition: AutomationRuleDefinition = {
    name: parsed.data.name,
    triggerType: parsed.data.triggerType as TriggerType,
    triggerConfig: parsed.data.triggerConfig as unknown as TriggerConfig,
    actionType: parsed.data.actionType as ActionType,
    actionConfig: parsed.data.actionConfig as unknown as ActionConfig,
    enabled: parsed.data.enabled ?? true,
  };
  if (parsed.data.description) {
    definition.description = parsed.data.description;
  }

  const rule = await engine.createRule(definition);

  log.info({ ruleId: rule.id, name: rule.name }, 'Automation rule created via API');

  return c.json(
    {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      triggerType: rule.triggerType,
      triggerConfig: JSON.parse(rule.triggerConfig),
      actionType: rule.actionType,
      actionConfig: JSON.parse(rule.actionConfig),
      enabled: rule.enabled,
      createdAt: rule.createdAt,
    },
    201
  );
});

// ==================
// Update Rule
// ==================

const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  triggerType: z.enum(['time_based', 'event_based']).optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  actionType: z.enum(['send_message', 'create_task', 'notify_staff', 'webhook']).optional(),
  actionConfig: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

/**
 * PUT /api/v1/automation/rules/:ruleId
 * Update an automation rule
 */
automationRoutes.put('/rules/:ruleId', async (c) => {
  const { ruleId } = c.req.param();

  const body = await c.req.json();
  const parsed = updateRuleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
  }

  const engine = getAutomationEngine();

  // Check rule exists
  const existing = await engine.getRule(ruleId);
  if (!existing) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  const updates: Partial<AutomationRuleDefinition> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.triggerType !== undefined) updates.triggerType = parsed.data.triggerType as TriggerType;
  if (parsed.data.triggerConfig !== undefined) updates.triggerConfig = parsed.data.triggerConfig as unknown as TriggerConfig;
  if (parsed.data.actionType !== undefined) updates.actionType = parsed.data.actionType as ActionType;
  if (parsed.data.actionConfig !== undefined) updates.actionConfig = parsed.data.actionConfig as unknown as ActionConfig;
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;

  const rule = await engine.updateRule(ruleId, updates);

  if (!rule) {
    return c.json({ error: 'Failed to update rule' }, 500);
  }

  log.info({ ruleId, name: rule.name }, 'Automation rule updated via API');

  return c.json({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    triggerType: rule.triggerType,
    triggerConfig: JSON.parse(rule.triggerConfig),
    actionType: rule.actionType,
    actionConfig: JSON.parse(rule.actionConfig),
    enabled: rule.enabled,
    updatedAt: rule.updatedAt,
  });
});

// ==================
// Delete Rule
// ==================

/**
 * DELETE /api/v1/automation/rules/:ruleId
 * Delete an automation rule
 */
automationRoutes.delete('/rules/:ruleId', async (c) => {
  const { ruleId } = c.req.param();

  const engine = getAutomationEngine();
  const deleted = await engine.deleteRule(ruleId);

  if (!deleted) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  log.info({ ruleId }, 'Automation rule deleted via API');

  return c.json({ success: true });
});

// ==================
// Toggle Rule
// ==================

/**
 * POST /api/v1/automation/rules/:ruleId/toggle
 * Enable or disable a rule
 */
automationRoutes.post('/rules/:ruleId/toggle', async (c) => {
  const { ruleId } = c.req.param();

  const body = await c.req.json();
  const enabled = body.enabled === true;

  const engine = getAutomationEngine();
  const rule = await engine.toggleRule(ruleId, enabled);

  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  log.info({ ruleId, enabled }, 'Automation rule toggled via API');

  return c.json({
    success: true,
    enabled: rule.enabled,
  });
});

// ==================
// Get Rule Logs
// ==================

/**
 * GET /api/v1/automation/rules/:ruleId/logs
 * Get execution logs for a specific rule
 */
automationRoutes.get('/rules/:ruleId/logs', async (c) => {
  const { ruleId } = c.req.param();
  const limit = parseInt(c.req.query('limit') ?? '50', 10);

  const engine = getAutomationEngine();

  // Check rule exists
  const rule = await engine.getRule(ruleId);
  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  const logs = await db
    .select()
    .from(automationLogs)
    .where(eq(automationLogs.ruleId, ruleId))
    .orderBy(desc(automationLogs.createdAt))
    .limit(Math.min(limit, 100));

  return c.json({
    logs: logs.map((logEntry) => ({
      id: logEntry.id,
      status: logEntry.status,
      triggerData: logEntry.triggerData ? JSON.parse(logEntry.triggerData) : null,
      actionResult: logEntry.actionResult ? JSON.parse(logEntry.actionResult) : null,
      errorMessage: logEntry.errorMessage,
      executionTimeMs: logEntry.executionTimeMs,
      createdAt: logEntry.createdAt,
    })),
  });
});

// ==================
// Get All Logs
// ==================

/**
 * GET /api/v1/automation/logs
 * Get all automation execution logs
 */
automationRoutes.get('/logs', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const status = c.req.query('status'); // Optional filter

  let logs;
  if (status === 'success' || status === 'failed') {
    logs = await db
      .select()
      .from(automationLogs)
      .where(eq(automationLogs.status, status))
      .orderBy(desc(automationLogs.createdAt))
      .limit(Math.min(limit, 100));
  } else {
    logs = await db
      .select()
      .from(automationLogs)
      .orderBy(desc(automationLogs.createdAt))
      .limit(Math.min(limit, 100));
  }

  return c.json({
    logs: logs.map((logEntry) => ({
      id: logEntry.id,
      ruleId: logEntry.ruleId,
      status: logEntry.status,
      triggerData: logEntry.triggerData ? JSON.parse(logEntry.triggerData) : null,
      actionResult: logEntry.actionResult ? JSON.parse(logEntry.actionResult) : null,
      errorMessage: logEntry.errorMessage,
      executionTimeMs: logEntry.executionTimeMs,
      createdAt: logEntry.createdAt,
    })),
  });
});

// ==================
// Test Rule (Dry Run)
// ==================

/**
 * POST /api/v1/automation/rules/:ruleId/test
 * Test a rule execution (dry run)
 */
automationRoutes.post('/rules/:ruleId/test', async (c) => {
  const { ruleId } = c.req.param();

  const engine = getAutomationEngine();
  const rule = await engine.getRule(ruleId);

  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  // For now, just validate the rule configuration
  // In a full implementation, this would do a dry-run execution
  try {
    const triggerConfig = JSON.parse(rule.triggerConfig) as Record<string, unknown>;
    const actionConfig = JSON.parse(rule.actionConfig) as Record<string, unknown>;

    // Validate trigger config based on type
    if (rule.triggerType === 'time_based') {
      if (!triggerConfig.type) {
        throw new Error('Time-based trigger missing type');
      }
    } else if (rule.triggerType === 'event_based') {
      if (!triggerConfig.eventType) {
        throw new Error('Event-based trigger missing eventType');
      }
    }

    // Validate action config based on type
    if (rule.actionType === 'send_message') {
      if (!actionConfig.template) {
        throw new Error('Send message action missing template');
      }
      const templates = getAvailableTemplates();
      if (!templates.includes(actionConfig.template as string)) {
        throw new Error(`Unknown template: ${actionConfig.template}`);
      }
    } else if (rule.actionType === 'webhook') {
      if (!actionConfig.url) {
        throw new Error('Webhook action missing URL');
      }
    }

    log.info({ ruleId }, 'Automation rule test passed');

    return c.json({
      success: true,
      message: 'Rule configuration is valid',
      details: {
        triggerType: rule.triggerType,
        triggerConfig,
        actionType: rule.actionType,
        actionConfig,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      success: false,
      message: `Rule configuration invalid: ${message}`,
    });
  }
});
