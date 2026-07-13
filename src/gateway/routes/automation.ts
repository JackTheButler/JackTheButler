/**
 * Automation Management API Routes
 *
 * Endpoints for managing automation rules.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import {
  getAutomationEngine,
  getAvailableTemplates,
  type AutomationRuleDefinition,
  type TriggerType,
  type ActionType,
  type TriggerConfig,
  type ActionConfig,
} from '@/core/automation/index.js';
import { automationService } from '@/services/automation.js';
import { createLogger } from '@/utils/logger.js';
import { getAppRegistry } from '@/apps/index.js';
import { requireAuth, requirePermission, validateBody } from '@/gateway/middleware/index.js';
import { PERMISSIONS } from '@/permissions/index.js';

const log = createLogger('api:automation');

/**
 * Automation routes
 */
export const automationRoutes = new Hono<{ Variables: { validatedBody: unknown } }>();

// Apply auth to all routes
automationRoutes.use('/*', requireAuth);

// ==================
// List Rules
// ==================

/**
 * GET /api/v1/automation/rules
 * List all automation rules
 */
automationRoutes.get('/rules', requirePermission(PERMISSIONS.AUTOMATIONS_VIEW), async (c) => {
  try {
    const engine = getAutomationEngine();
    const rules = await engine.getRules();

    // Transform for API response (safely parse JSON fields)
    const response = rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      triggerType: rule.triggerType,
      triggerConfig: rule.triggerConfig ? JSON.parse(rule.triggerConfig) : {},
      actionType: rule.actionType,
      actionConfig: rule.actionConfig ? JSON.parse(rule.actionConfig) : {},
      enabled: rule.enabled,
      runCount: rule.runCount || 0,
      lastRunAt: rule.lastRunAt,
      lastError: rule.lastError,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    }));

    return c.json({ rules: response });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error, message }, 'Failed to list automation rules');
    return c.json({ error: 'Failed to load automation rules', details: message }, 500);
  }
});

// ==================
// Get Templates
// ==================

/**
 * GET /api/v1/automation/templates
 * Get available message templates
 */
automationRoutes.get('/templates', requirePermission(PERMISSIONS.AUTOMATIONS_VIEW), async (c) => {
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
automationRoutes.get('/rules/:ruleId', requirePermission(PERMISSIONS.AUTOMATIONS_VIEW), async (c) => {
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
automationRoutes.post('/rules', requirePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateBody(createRuleSchema), async (c) => {
  const data = c.get('validatedBody') as z.infer<typeof createRuleSchema>;

  const engine = getAutomationEngine();
  const definition: AutomationRuleDefinition = {
    name: data.name,
    triggerType: data.triggerType as TriggerType,
    triggerConfig: data.triggerConfig as unknown as TriggerConfig,
    actionType: data.actionType as ActionType,
    actionConfig: data.actionConfig as unknown as ActionConfig,
    enabled: data.enabled ?? true,
  };
  if (data.description) {
    definition.description = data.description;
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
automationRoutes.put('/rules/:ruleId', requirePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateBody(updateRuleSchema), async (c) => {
  const { ruleId } = c.req.param();
  const data = c.get('validatedBody') as z.infer<typeof updateRuleSchema>;

  const engine = getAutomationEngine();

  // Check rule exists
  const existing = await engine.getRule(ruleId);
  if (!existing) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  const updates: Partial<AutomationRuleDefinition> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.triggerType !== undefined) updates.triggerType = data.triggerType as TriggerType;
  if (data.triggerConfig !== undefined) updates.triggerConfig = data.triggerConfig as unknown as TriggerConfig;
  if (data.actionType !== undefined) updates.actionType = data.actionType as ActionType;
  if (data.actionConfig !== undefined) updates.actionConfig = data.actionConfig as unknown as ActionConfig;
  if (data.enabled !== undefined) updates.enabled = data.enabled;

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
automationRoutes.delete('/rules/:ruleId', requirePermission(PERMISSIONS.AUTOMATIONS_MANAGE), async (c) => {
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
automationRoutes.post('/rules/:ruleId/toggle', requirePermission(PERMISSIONS.AUTOMATIONS_MANAGE), async (c) => {
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
automationRoutes.get('/rules/:ruleId/logs', requirePermission(PERMISSIONS.AUTOMATIONS_VIEW), async (c) => {
  const { ruleId } = c.req.param();
  const limit = parseInt(c.req.query('limit') ?? '50', 10);

  const engine = getAutomationEngine();

  // Check rule exists
  const rule = await engine.getRule(ruleId);
  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  const logs = await automationService.getLogsForRule(ruleId, limit);

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
automationRoutes.get('/logs', requirePermission(PERMISSIONS.AUTOMATIONS_VIEW), async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const status = c.req.query('status'); // Optional filter

  const logs = await automationService.getLogs({ status, limit });

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
automationRoutes.post('/rules/:ruleId/test', requirePermission(PERMISSIONS.AUTOMATIONS_MANAGE), async (c) => {
  const { ruleId } = c.req.param();

  const engine = getAutomationEngine();
  const result = await engine.testRule(ruleId);

  if (!result) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  return c.json(result);
});

// ==================
// Generate Rule from Natural Language
// ==================

const generateRuleSchema = z.object({
  prompt: z.string().min(10).max(1000),
});

/**
 * POST /api/v1/automation/generate
 * Generate an automation rule from natural language description
 */
automationRoutes.post('/generate', requirePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateBody(generateRuleSchema), async (c) => {
  const { prompt } = c.get('validatedBody') as z.infer<typeof generateRuleSchema>;

  try {
    const registry = getAppRegistry();
    const aiProvider = registry.getCompletionProvider();

    if (!aiProvider) {
      return c.json({ error: 'No AI provider available' }, 503);
    }

    const result = await automationService.generateRuleFromPrompt(prompt, aiProvider);

    if (!result.ok) {
      if (result.kind === 'parse_error') {
        return c.json(
          {
            error: 'Failed to parse generated rule',
            details: 'The AI response was not valid JSON',
            raw: result.raw,
          },
          422
        );
      }

      return c.json(
        {
          error: 'Invalid generated rule',
          details: 'Missing required fields (name, triggerType, triggerConfig)',
          rule: result.rule,
        },
        422
      );
    }

    return c.json({
      rule: result.rule,
      prompt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error, prompt }, 'Failed to generate automation rule');

    return c.json({
      error: 'Failed to generate rule',
      details: message,
    }, 500);
  }
});
