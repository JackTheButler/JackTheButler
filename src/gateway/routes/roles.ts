/**
 * Role Routes
 *
 * API endpoints for managing roles and permissions.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { roleService } from '@/services/role.js';
import { validateBody } from '../middleware/validator.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  PERMISSIONS,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  getAllPermissions,
  WILDCARD_PERMISSION,
} from '@/core/permissions/index.js';

const createBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).min(1),
});

const updateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(z.string()).optional(),
});

type Variables = {
  validatedBody: unknown;
  userId: string;
};

const rolesRouter = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
rolesRouter.use('/*', requireAuth);

/**
 * GET /api/v1/roles
 * List all roles with user counts
 */
rolesRouter.get('/', requirePermission(PERMISSIONS.ADMIN_VIEW), async (c) => {
  const roles = await roleService.getRoles();
  return c.json({ roles });
});

/**
 * GET /api/v1/roles/:id
 * Get role by ID
 */
rolesRouter.get('/:id', requirePermission(PERMISSIONS.ADMIN_VIEW), async (c) => {
  const id = c.req.param('id');
  const role = await roleService.getRoleById(id);
  return c.json({ role });
});

/**
 * POST /api/v1/roles
 * Create a new role
 */
rolesRouter.post(
  '/',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateBody(createBodySchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof createBodySchema>;
    const role = await roleService.createRole({
      name: body.name,
      permissions: body.permissions,
      ...(body.description !== undefined && { description: body.description }),
    });
    return c.json({ role }, 201);
  }
);

/**
 * PATCH /api/v1/roles/:id
 * Update a role
 */
rolesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateBody(updateBodySchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.get('validatedBody') as z.infer<typeof updateBodySchema>;

    // Build update input, filtering out undefined values
    const updateInput: Record<string, unknown> = {};
    if (body.name !== undefined) updateInput.name = body.name;
    if (body.description !== undefined) updateInput.description = body.description;
    if (body.permissions !== undefined) updateInput.permissions = body.permissions;

    const role = await roleService.updateRole(id, updateInput);
    return c.json({ role });
  }
);

/**
 * DELETE /api/v1/roles/:id
 * Delete a role (non-system roles only)
 */
rolesRouter.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE), async (c) => {
  const id = c.req.param('id');
  await roleService.deleteRole(id);
  return c.json({ success: true });
});

/**
 * GET /api/v1/permissions
 * List all available permissions with metadata
 */
const permissionsRouter = new Hono<{ Variables: Variables }>();

permissionsRouter.use('/*', requireAuth);

permissionsRouter.get('/', requirePermission(PERMISSIONS.ADMIN_VIEW), async (c) => {
  return c.json({
    permissions: PERMISSION_DEFINITIONS,
    groups: PERMISSION_GROUPS,
    all: getAllPermissions(),
    wildcard: WILDCARD_PERMISSION,
  });
});

export { rolesRouter, permissionsRouter };
