/**
 * Autonomy & Approval Routes
 *
 * API endpoints for managing autonomy settings and approval queue.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import {
  getAutonomyEngine,
  DEFAULT_AUTONOMY_SETTINGS,
  type AutonomySettings,
  type ActionConfig,
} from '@/core/autonomy.js';
import { getApprovalQueue } from '@/core/approval-queue.js';
import { validateBody, validateQuery } from '../middleware/validator.js';
import { requireAuth } from '../middleware/auth.js';

// ===================
// Schemas
// ===================

const autonomyLevelSchema = z.enum(['L1', 'L2']);

const actionConfigSchema = z.object({
  level: autonomyLevelSchema,
  maxAutoAmount: z.number().min(0).optional(),
  maxAutoPercent: z.number().min(0).max(100).optional(),
});

const autonomySettingsSchema = z.object({
  defaultLevel: autonomyLevelSchema,
  actions: z.record(z.string(), actionConfigSchema) as z.ZodType<Record<string, ActionConfig>>,
  confidenceThresholds: z.object({
    autoExecute: z.number().min(0).max(1),
    suggestToStaff: z.number().min(0).max(1),
    escalate: z.number().min(0).max(1),
  }),
  vipOverrides: z.object({
    alwaysEscalateComplaints: z.boolean(),
    requireApprovalForOffers: z.boolean(),
    elevateTaskPriority: z.boolean(),
  }),
});

const listApprovalsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  type: z.enum(['response', 'task', 'offer']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const rejectBodySchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

type Variables = {
  validatedBody: unknown;
  validatedQuery: unknown;
  userId: string;
};

// ===================
// Settings Routes
// ===================

const settingsRouter = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
settingsRouter.use('/*', requireAuth);

/**
 * GET /api/v1/settings/autonomy
 * Get current autonomy settings
 */
settingsRouter.get('/', async (c) => {
  const engine = getAutonomyEngine();
  await engine.ensureLoaded();
  const settings = engine.getSettings();

  return c.json({ settings });
});

/**
 * PUT /api/v1/settings/autonomy
 * Update autonomy settings
 */
settingsRouter.put('/', validateBody(autonomySettingsSchema), async (c) => {
  const body = c.get('validatedBody') as AutonomySettings;

  const engine = getAutonomyEngine();
  await engine.saveSettings(body);

  return c.json({
    message: 'Autonomy settings updated',
    settings: engine.getSettings(),
  });
});

/**
 * GET /api/v1/settings/autonomy/defaults
 * Get default autonomy settings
 */
settingsRouter.get('/defaults', (c) => {
  return c.json({ settings: DEFAULT_AUTONOMY_SETTINGS });
});

/**
 * POST /api/v1/settings/autonomy/reset
 * Reset autonomy settings to defaults
 */
settingsRouter.post('/reset', async (c) => {
  const engine = getAutonomyEngine();
  await engine.resetToDefaults();

  return c.json({
    message: 'Autonomy settings reset to defaults',
    settings: engine.getSettings(),
  });
});

// ===================
// Approval Routes
// ===================

const approvalsRouter = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
approvalsRouter.use('/*', requireAuth);

/**
 * GET /api/v1/approvals
 * List approval items with optional filters
 */
approvalsRouter.get('/', validateQuery(listApprovalsQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as z.infer<typeof listApprovalsQuerySchema>;

  const queue = getApprovalQueue();
  const items = await queue.list({
    status: query.status ?? undefined,
    type: query.type ?? undefined,
    limit: query.limit,
    offset: query.offset,
  });

  const stats = await queue.getStats();

  return c.json({
    items,
    stats,
    pagination: {
      limit: query.limit,
      offset: query.offset,
    },
  });
});

/**
 * GET /api/v1/approvals/stats
 * Get approval statistics
 */
approvalsRouter.get('/stats', async (c) => {
  const queue = getApprovalQueue();
  const stats = await queue.getStats();

  return c.json({ stats });
});

/**
 * GET /api/v1/approvals/:id
 * Get approval item details
 */
approvalsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const queue = getApprovalQueue();
  const item = await queue.getDetails(id);

  return c.json({ item });
});

/**
 * POST /api/v1/approvals/:id/approve
 * Approve an item
 */
approvalsRouter.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');

  const queue = getApprovalQueue();
  const item = await queue.approve(id, userId);

  // Execute the approved action
  await queue.executeApprovedAction(item);

  return c.json({
    message: 'Item approved and executed',
    item,
  });
});

/**
 * POST /api/v1/approvals/:id/reject
 * Reject an item
 */
approvalsRouter.post('/:id/reject', validateBody(rejectBodySchema), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const body = c.get('validatedBody') as z.infer<typeof rejectBodySchema>;

  const queue = getApprovalQueue();
  const item = await queue.reject(id, userId, body.reason);

  return c.json({
    message: 'Item rejected',
    item,
  });
});

export { settingsRouter as autonomySettingsRoutes, approvalsRouter as approvalsRoutes };
