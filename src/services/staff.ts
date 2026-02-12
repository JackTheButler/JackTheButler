/**
 * Staff Service
 *
 * Manages staff users and their role assignments.
 */

import { eq, and, desc, sql, or, like } from 'drizzle-orm';
import { db, staff, roles, conversations, tasks, approvalQueue } from '@/db/index.js';
import type { Staff } from '@/db/schema.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { NotFoundError, ValidationError, ForbiddenError } from '@/errors/index.js';
import { WILDCARD_PERMISSION } from '@/core/permissions/index.js';
import { authService } from './auth.js';

const log = createLogger('staff');

export type StaffStatus = 'active' | 'inactive';

export interface StaffWithRole {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  roleId: string;
  roleName: string;
  permissions: string[];
  status: string;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  isDeletable?: boolean;
}

export interface CreateStaffInput {
  email: string;
  name: string;
  password: string;
  roleId: string;
  phone?: string;
}

export interface UpdateStaffInput {
  name?: string;
  phone?: string | null;
  roleId?: string;
  status?: StaffStatus;
}

export interface ListStaffOptions {
  status?: StaffStatus | undefined;
  roleId?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  currentUserId?: string | undefined;
}

export class StaffService {
  /**
   * List staff with role information
   */
  async list(options: ListStaffOptions = {}): Promise<StaffWithRole[]> {
    const { status, roleId, search, limit = 50, offset = 0, currentUserId } = options;

    const conditions = [];

    if (status) {
      conditions.push(eq(staff.status, status));
    }

    if (roleId) {
      conditions.push(eq(staff.roleId, roleId));
    }

    if (search) {
      conditions.push(
        or(like(staff.name, `%${search}%`), like(staff.email, `%${search}%`))
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select({
        id: staff.id,
        email: staff.email,
        name: staff.name,
        phone: staff.phone,
        roleId: staff.roleId,
        roleName: roles.name,
        permissions: staff.permissions,
        status: staff.status,
        lastActiveAt: staff.lastActiveAt,
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
      })
      .from(staff)
      .leftJoin(roles, eq(staff.roleId, roles.id))
      .where(whereClause)
      .orderBy(desc(staff.createdAt))
      .limit(limit)
      .offset(offset);

    const mapped = results.map((r) => ({
      ...r,
      roleName: r.roleName || 'Unknown',
      permissions: JSON.parse(r.permissions) as string[],
    }));

    // Compute isDeletable for each staff member
    // A user is not deletable if: they are the current user, they are the last admin, or they have references
    const adminCount = await this.countAdmins();
    const withDeletable = await Promise.all(
      mapped.map(async (m) => {
        // Cannot delete yourself
        if (currentUserId && m.id === currentUserId) {
          return { ...m, isDeletable: false };
        }
        // Cannot delete last admin
        const isAdmin = m.permissions.includes(WILDCARD_PERMISSION);
        if (isAdmin && adminCount <= 1) {
          return { ...m, isDeletable: false };
        }
        // Cannot delete if has references
        const refCount = await this.getReferenceCount(m.id);
        return { ...m, isDeletable: refCount === 0 };
      })
    );

    return withDeletable;
  }

  /**
   * Get staff by ID with role information
   */
  async getById(id: string): Promise<StaffWithRole> {
    const [result] = await db
      .select({
        id: staff.id,
        email: staff.email,
        name: staff.name,
        phone: staff.phone,
        roleId: staff.roleId,
        roleName: roles.name,
        permissions: staff.permissions,
        status: staff.status,
        lastActiveAt: staff.lastActiveAt,
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
      })
      .from(staff)
      .leftJoin(roles, eq(staff.roleId, roles.id))
      .where(eq(staff.id, id))
      .limit(1);

    if (!result) {
      throw new NotFoundError('Staff', id);
    }

    return {
      ...result,
      roleName: result.roleName || 'Unknown',
      permissions: JSON.parse(result.permissions) as string[],
    };
  }

  /**
   * Get staff by email
   */
  async getByEmail(email: string): Promise<StaffWithRole | null> {
    const [result] = await db
      .select({
        id: staff.id,
        email: staff.email,
        name: staff.name,
        phone: staff.phone,
        roleId: staff.roleId,
        roleName: roles.name,
        permissions: staff.permissions,
        status: staff.status,
        lastActiveAt: staff.lastActiveAt,
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
      })
      .from(staff)
      .leftJoin(roles, eq(staff.roleId, roles.id))
      .where(eq(staff.email, email.toLowerCase()))
      .limit(1);

    if (!result) {
      return null;
    }

    return {
      ...result,
      roleName: result.roleName || 'Unknown',
      permissions: JSON.parse(result.permissions) as string[],
    };
  }

  /**
   * Create a new staff member
   */
  async create(input: CreateStaffInput): Promise<StaffWithRole> {
    // Validate email is unique
    const existing = await this.getByEmail(input.email);
    if (existing) {
      throw new ValidationError('A user with this email already exists');
    }

    // Validate role exists
    const [role] = await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
    if (!role) {
      throw new ValidationError('Invalid role ID');
    }

    // Validate password
    if (!input.password || input.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const id = generateId('staff');
    const now = new Date().toISOString();
    const passwordHash = await authService.hashPassword(input.password);

    await db.insert(staff).values({
      id,
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      roleId: input.roleId,
      permissions: JSON.stringify([]),
      status: 'active',
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    log.info({ staffId: id, email: input.email }, 'Created staff member');

    return this.getById(id);
  }

  /**
   * Update a staff member
   */
  async update(
    id: string,
    input: UpdateStaffInput,
    currentUserId?: string
  ): Promise<StaffWithRole> {
    const existing = await this.getById(id);

    // Validate role if changing
    if (input.roleId && input.roleId !== existing.roleId) {
      const [role] = await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
      if (!role) {
        throw new ValidationError('Invalid role ID');
      }

      // Check for self-demotion
      if (currentUserId && id === currentUserId) {
        const currentRolePerms = await this.getRolePermissions(existing.roleId);
        const newRolePerms = await this.getRolePermissions(input.roleId);

        // If current role has admin (wildcard) and new role doesn't, prevent
        if (
          currentRolePerms.includes(WILDCARD_PERMISSION) &&
          !newRolePerms.includes(WILDCARD_PERMISSION)
        ) {
          throw new ForbiddenError('Cannot remove your own admin access');
        }
      }
    }

    const now = new Date().toISOString();
    const updates: Partial<Staff> = { updatedAt: now };

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }
    if (input.phone !== undefined) {
      updates.phone = input.phone?.trim() || null;
    }
    if (input.roleId !== undefined) {
      updates.roleId = input.roleId;
    }
    if (input.status !== undefined) {
      updates.status = input.status;
    }

    await db.update(staff).set(updates).where(eq(staff.id, id));

    log.info({ staffId: id }, 'Updated staff member');

    return this.getById(id);
  }

  /**
   * Deactivate a staff member
   */
  async deactivate(id: string, currentUserId?: string): Promise<StaffWithRole> {
    const existing = await this.getById(id);

    // Prevent self-deactivation
    if (currentUserId && id === currentUserId) {
      throw new ForbiddenError('Cannot deactivate your own account');
    }

    // Check if this is the last admin
    const rolePerms = await this.getRolePermissions(existing.roleId);
    if (rolePerms.includes(WILDCARD_PERMISSION)) {
      const adminCount = await this.countAdmins();
      if (adminCount <= 1) {
        throw new ForbiddenError('Cannot deactivate the last admin user');
      }
    }

    return this.update(id, { status: 'inactive' });
  }

  /**
   * Activate a staff member
   */
  async activate(id: string): Promise<StaffWithRole> {
    await this.getById(id); // Verify exists
    return this.update(id, { status: 'active' });
  }

  /**
   * Get reference count for a staff member (conversations, tasks, approvals)
   */
  async getReferenceCount(id: string): Promise<number> {
    const [convCount] = await db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(conversations)
      .where(eq(conversations.assignedTo, id));

    const [taskCount] = await db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(tasks)
      .where(eq(tasks.assignedTo, id));

    const [approvalCount] = await db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(approvalQueue)
      .where(eq(approvalQueue.decidedBy, id));

    return (convCount?.count || 0) + (taskCount?.count || 0) + (approvalCount?.count || 0);
  }

  /**
   * Delete a staff member (only if they have no references)
   */
  async delete(id: string, currentUserId?: string): Promise<void> {
    const existing = await this.getById(id);

    // Prevent self-deletion
    if (currentUserId && id === currentUserId) {
      throw new ForbiddenError('Cannot delete your own account');
    }

    // Check if this is the last admin
    const rolePerms = await this.getRolePermissions(existing.roleId);
    if (rolePerms.includes(WILDCARD_PERMISSION)) {
      const adminCount = await this.countAdmins();
      if (adminCount <= 1) {
        throw new ForbiddenError('Cannot delete the last admin user');
      }
    }

    // Check for references
    const refCount = await this.getReferenceCount(id);
    if (refCount > 0) {
      throw new ValidationError(
        'Cannot delete user with existing references. Deactivate them instead.'
      );
    }

    await db.delete(staff).where(eq(staff.id, id));

    log.info({ staffId: id, email: existing.email }, 'Deleted staff member');
  }

  /**
   * Update password for a staff member
   */
  async updatePassword(id: string, newPassword: string): Promise<void> {
    await this.getById(id); // Verify exists

    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const passwordHash = await authService.hashPassword(newPassword);
    const now = new Date().toISOString();

    await db.update(staff).set({ passwordHash, updatedAt: now }).where(eq(staff.id, id));

    log.info({ staffId: id }, 'Updated staff password');
  }

  /**
   * Count active admin users (users with wildcard permission)
   */
  private async countAdmins(): Promise<number> {
    // Get all roles with wildcard permission
    const allRoles = await db.select().from(roles);
    const adminRoleIds = allRoles
      .filter((r) => {
        const perms = JSON.parse(r.permissions) as string[];
        return perms.includes(WILDCARD_PERMISSION);
      })
      .map((r) => r.id);

    if (adminRoleIds.length === 0) {
      return 0;
    }

    // Count active staff with admin roles
    const [result] = await db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(staff)
      .where(
        and(
          eq(staff.status, 'active'),
          or(...adminRoleIds.map((rid) => eq(staff.roleId, rid)))
        )
      );

    return result?.count || 0;
  }

  /**
   * Get permissions for a role
   */
  private async getRolePermissions(roleId: string): Promise<string[]> {
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) {
      return [];
    }
    return JSON.parse(role.permissions) as string[];
  }

  /**
   * Get staff statistics
   */
  async getStats(): Promise<{ total: number; active: number; inactive: number; byRole: Record<string, number> }> {
    const allStaff = await db
      .select({
        status: staff.status,
        roleId: staff.roleId,
      })
      .from(staff);

    const stats = {
      total: allStaff.length,
      active: allStaff.filter((s) => s.status === 'active').length,
      inactive: allStaff.filter((s) => s.status === 'inactive').length,
      byRole: {} as Record<string, number>,
    };

    for (const s of allStaff) {
      stats.byRole[s.roleId] = (stats.byRole[s.roleId] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
export const staffService = new StaffService();
