/**
 * Staff Routes
 *
 * API endpoints for managing staff users.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { staffService } from '@/services/staff.js';
import { validateBody, validateQuery } from '../middleware/validator.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '@/core/permissions/index.js';

const listQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  roleId: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const createBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
  roleId: z.string().min(1),
  phone: z.string().optional(),
});

const updateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional().nullable(),
  roleId: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const updatePasswordSchema = z.object({
  password: z.string().min(8),
});

type Variables = {
  validatedBody: unknown;
  validatedQuery: unknown;
  userId: string;
};

const staffRouter = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
staffRouter.use('/*', requireAuth);

/**
 * GET /api/v1/staff/stats
 * Get staff statistics
 */
staffRouter.get('/stats', requirePermission(PERMISSIONS.ADMIN_VIEW), async (c) => {
  const stats = await staffService.getStats();
  return c.json(stats);
});

/**
 * GET /api/v1/staff
 * List all staff with role information
 */
staffRouter.get(
  '/',
  requirePermission(PERMISSIONS.ADMIN_VIEW),
  validateQuery(listQuerySchema),
  async (c) => {
    const query = c.get('validatedQuery') as z.infer<typeof listQuerySchema>;
    const currentUserId = c.get('userId');

    const staffList = await staffService.list({
      status: query.status,
      roleId: query.roleId,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
      currentUserId,
    });

    return c.json({
      staff: staffList,
      pagination: {
        limit: query.limit,
        offset: query.offset,
      },
    });
  }
);

/**
 * GET /api/v1/staff/:id
 * Get staff by ID
 */
staffRouter.get('/:id', requirePermission(PERMISSIONS.ADMIN_VIEW), async (c) => {
  const id = c.req.param('id');
  const member = await staffService.getById(id);
  return c.json({ staff: member });
});

/**
 * POST /api/v1/staff
 * Create a new staff member
 */
staffRouter.post(
  '/',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateBody(createBodySchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof createBodySchema>;

    const member = await staffService.create({
      email: body.email,
      name: body.name,
      password: body.password,
      roleId: body.roleId,
      ...(body.phone !== undefined && { phone: body.phone }),
    });

    return c.json({ staff: member }, 201);
  }
);

/**
 * PATCH /api/v1/staff/:id
 * Update a staff member
 */
staffRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateBody(updateBodySchema),
  async (c) => {
    const id = c.req.param('id');
    const currentUserId = c.get('userId');
    const body = c.get('validatedBody') as z.infer<typeof updateBodySchema>;

    // Build update input, filtering out undefined values
    const updateInput: Record<string, unknown> = {};
    if (body.name !== undefined) updateInput.name = body.name;
    if (body.phone !== undefined) updateInput.phone = body.phone;
    if (body.roleId !== undefined) updateInput.roleId = body.roleId;
    if (body.status !== undefined) updateInput.status = body.status;

    const member = await staffService.update(id, updateInput, currentUserId);
    return c.json({ staff: member });
  }
);

/**
 * PATCH /api/v1/staff/:id/password
 * Update staff password
 */
staffRouter.patch(
  '/:id/password',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateBody(updatePasswordSchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.get('validatedBody') as z.infer<typeof updatePasswordSchema>;

    await staffService.updatePassword(id, body.password);
    return c.json({ success: true });
  }
);

/**
 * DELETE /api/v1/staff/:id
 * Delete a staff member (only if they have no references)
 */
staffRouter.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE), async (c) => {
  const id = c.req.param('id');
  const currentUserId = c.get('userId');

  await staffService.delete(id, currentUserId);
  return c.json({ success: true });
});

/**
 * POST /api/v1/staff/:id/deactivate
 * Deactivate a staff member
 */
staffRouter.post('/:id/deactivate', requirePermission(PERMISSIONS.ADMIN_MANAGE), async (c) => {
  const id = c.req.param('id');
  const currentUserId = c.get('userId');

  const member = await staffService.deactivate(id, currentUserId);
  return c.json({ staff: member });
});

/**
 * POST /api/v1/staff/:id/activate
 * Activate a staff member
 */
staffRouter.post('/:id/activate', requirePermission(PERMISSIONS.ADMIN_MANAGE), async (c) => {
  const id = c.req.param('id');

  const member = await staffService.activate(id);
  return c.json({ staff: member });
});

export { staffRouter };
