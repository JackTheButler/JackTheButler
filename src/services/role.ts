/**
 * Role Service
 *
 * Manages roles and permissions for access control.
 */

import { eq, sql } from 'drizzle-orm';
import { db, roles, staff } from '@/db/index.js';
import type { Role } from '@/db/schema.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { NotFoundError, ValidationError, ForbiddenError } from '@/errors/index.js';
import {
  hasPermission,
  hasAnyPermission,
  getAllPermissions,
  WILDCARD_PERMISSION,
  type CreateRoleInput,
  type UpdateRoleInput,
  type RoleWithStats,
} from '@/core/permissions/index.js';

const log = createLogger('role');

export class RoleService {
  /**
   * Get all roles with user counts
   */
  async getRoles(): Promise<RoleWithStats[]> {
    const allRoles = await db.select().from(roles).orderBy(roles.name);

    // Get user counts for each role
    const roleCounts = await db
      .select({
        roleId: staff.roleId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(staff)
      .where(eq(staff.status, 'active'))
      .groupBy(staff.roleId);

    const countMap = new Map(roleCounts.map((r) => [r.roleId, r.count]));

    return allRoles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: JSON.parse(role.permissions) as string[],
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: countMap.get(role.id) || 0,
    }));
  }

  /**
   * Get a role by ID
   */
  async getRoleById(id: string): Promise<RoleWithStats> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);

    if (!role) {
      throw new NotFoundError('Role', id);
    }

    // Get user count for this role
    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(staff)
      .where(eq(staff.roleId, id));

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: JSON.parse(role.permissions) as string[],
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: countResult?.count || 0,
    };
  }

  /**
   * Get a role by name
   */
  async getRoleByName(name: string): Promise<RoleWithStats | null> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name)).limit(1);

    if (!role) {
      return null;
    }

    // Get user count for this role
    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(staff)
      .where(eq(staff.roleId, role.id));

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: JSON.parse(role.permissions) as string[],
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: countResult?.count || 0,
    };
  }

  /**
   * Create a new custom role
   */
  async createRole(input: CreateRoleInput): Promise<RoleWithStats> {
    // Validate name is unique
    const existing = await this.getRoleByName(input.name);
    if (existing) {
      throw new ValidationError('A role with this name already exists');
    }

    // Validate permissions
    const validPermissions = getAllPermissions();
    const invalidPermissions = input.permissions.filter(
      (p) => p !== WILDCARD_PERMISSION && !validPermissions.includes(p)
    );
    if (invalidPermissions.length > 0) {
      throw new ValidationError(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    const id = generateId('role');
    const now = new Date().toISOString();

    await db.insert(roles).values({
      id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      permissions: JSON.stringify(input.permissions),
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    });

    log.info({ roleId: id, name: input.name }, 'Created role');

    return this.getRoleById(id);
  }

  /**
   * Update a role
   */
  async updateRole(id: string, input: UpdateRoleInput): Promise<RoleWithStats> {
    const role = await this.getRoleById(id);

    // Prevent renaming system roles
    if (role.isSystem && input.name && input.name !== role.name) {
      throw new ForbiddenError('Cannot rename system roles');
    }

    // Validate name uniqueness if changing
    if (input.name && input.name !== role.name) {
      const existing = await this.getRoleByName(input.name);
      if (existing) {
        throw new ValidationError('A role with this name already exists');
      }
    }

    // Validate permissions if provided
    if (input.permissions) {
      const validPermissions = getAllPermissions();
      const invalidPermissions = input.permissions.filter(
        (p) => p !== WILDCARD_PERMISSION && !validPermissions.includes(p)
      );
      if (invalidPermissions.length > 0) {
        throw new ValidationError(`Invalid permissions: ${invalidPermissions.join(', ')}`);
      }
    }

    const now = new Date().toISOString();
    const updates: Partial<Role> = { updatedAt: now };

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }
    if (input.description !== undefined) {
      updates.description = input.description?.trim() || null;
    }
    if (input.permissions !== undefined) {
      updates.permissions = JSON.stringify(input.permissions);
    }

    await db.update(roles).set(updates).where(eq(roles.id, id));

    log.info({ roleId: id }, 'Updated role');

    return this.getRoleById(id);
  }

  /**
   * Delete a role (only non-system roles)
   */
  async deleteRole(id: string): Promise<void> {
    const role = await this.getRoleById(id);

    if (role.isSystem) {
      throw new ForbiddenError('Cannot delete system roles');
    }

    if (role.userCount > 0) {
      throw new ValidationError(`Cannot delete role with ${role.userCount} assigned users. Reassign users first.`);
    }

    await db.delete(roles).where(eq(roles.id, id));

    log.info({ roleId: id, name: role.name }, 'Deleted role');
  }

  /**
   * Get permissions for a role
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    const role = await this.getRoleById(roleId);
    return role.permissions;
  }

  /**
   * Check if a user has a specific permission
   */
  async userHasPermission(userId: string, permission: string): Promise<boolean> {
    const [user] = await db.select().from(staff).where(eq(staff.id, userId)).limit(1);

    if (!user) {
      return false;
    }

    const rolePermissions = await this.getRolePermissions(user.roleId);

    // Check role permissions
    if (hasPermission(rolePermissions, permission)) {
      return true;
    }

    // Check user-level permission overrides
    const userPermissions = JSON.parse(user.permissions) as string[];
    return hasPermission(userPermissions, permission);
  }

  /**
   * Check if a user has any of the specified permissions
   */
  async userHasAnyPermission(userId: string, permissions: string[]): Promise<boolean> {
    const [user] = await db.select().from(staff).where(eq(staff.id, userId)).limit(1);

    if (!user) {
      return false;
    }

    const rolePermissions = await this.getRolePermissions(user.roleId);

    // Check role permissions
    if (hasAnyPermission(rolePermissions, permissions)) {
      return true;
    }

    // Check user-level permission overrides
    const userPermissions = JSON.parse(user.permissions) as string[];
    return hasAnyPermission(userPermissions, permissions);
  }

  /**
   * Get all permissions for a user (role + user overrides)
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const [user] = await db.select().from(staff).where(eq(staff.id, userId)).limit(1);

    if (!user) {
      return [];
    }

    const rolePermissions = await this.getRolePermissions(user.roleId);

    // If role has wildcard, return all permissions
    if (rolePermissions.includes(WILDCARD_PERMISSION)) {
      return [WILDCARD_PERMISSION];
    }

    // Merge role permissions with user overrides
    const userPermissions = JSON.parse(user.permissions) as string[];
    const allPermissions = new Set([...rolePermissions, ...userPermissions]);

    return Array.from(allPermissions);
  }
}

// Export singleton instance
export const roleService = new RoleService();
