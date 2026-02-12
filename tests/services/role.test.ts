/**
 * Role Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, roles, staff } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { RoleService } from '@/services/role.js';
import { PERMISSIONS, WILDCARD_PERMISSION } from '@/core/permissions/index.js';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { NotFoundError, ValidationError, ForbiddenError } from '@/errors/index.js';

describe('RoleService', () => {
  let service: RoleService;
  const testRoleIds: string[] = [];

  beforeEach(() => {
    service = new RoleService();
  });

  afterEach(async () => {
    // Clean up test roles
    for (const id of testRoleIds) {
      await db.delete(roles).where(eq(roles.id, id)).run();
    }
    testRoleIds.length = 0;
  });

  describe('getRoles', () => {
    it('should return all roles with user counts', async () => {
      const allRoles = await service.getRoles();

      expect(allRoles.length).toBeGreaterThanOrEqual(4); // At least system roles
      expect(allRoles[0]).toHaveProperty('userCount');
      expect(allRoles[0]).toHaveProperty('permissions');
      expect(Array.isArray(allRoles[0].permissions)).toBe(true);
    });

    it('should include system roles', async () => {
      const allRoles = await service.getRoles();
      const roleIds = allRoles.map((r) => r.id);

      expect(roleIds).toContain(SYSTEM_ROLE_IDS.ADMIN);
      expect(roleIds).toContain(SYSTEM_ROLE_IDS.MANAGER);
      expect(roleIds).toContain(SYSTEM_ROLE_IDS.STAFF);
      expect(roleIds).toContain(SYSTEM_ROLE_IDS.VIEWER);
    });
  });

  describe('getRoleById', () => {
    it('should return role by ID', async () => {
      const role = await service.getRoleById(SYSTEM_ROLE_IDS.ADMIN);

      expect(role.id).toBe(SYSTEM_ROLE_IDS.ADMIN);
      expect(role.name).toBe('Admin');
      expect(role.isSystem).toBe(true);
      expect(role.permissions).toContain(WILDCARD_PERMISSION);
    });

    it('should throw NotFoundError for unknown role', async () => {
      await expect(service.getRoleById('unknown-role')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getRoleByName', () => {
    it('should return role by name', async () => {
      const role = await service.getRoleByName('Admin');

      expect(role).not.toBeNull();
      expect(role?.id).toBe(SYSTEM_ROLE_IDS.ADMIN);
    });

    it('should return null for unknown name', async () => {
      const role = await service.getRoleByName('Unknown Role');
      expect(role).toBeNull();
    });
  });

  describe('createRole', () => {
    it('should create a custom role', async () => {
      const input = {
        name: 'Test Role',
        description: 'A test role',
        permissions: [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE],
      };

      const role = await service.createRole(input);
      testRoleIds.push(role.id);

      expect(role.name).toBe('Test Role');
      expect(role.description).toBe('A test role');
      expect(role.permissions).toContain(PERMISSIONS.TASKS_VIEW);
      expect(role.permissions).toContain(PERMISSIONS.TASKS_MANAGE);
      expect(role.isSystem).toBe(false);
    });

    it('should reject duplicate role names', async () => {
      const input = {
        name: 'Admin', // Already exists
        permissions: [PERMISSIONS.TASKS_VIEW],
      };

      await expect(service.createRole(input)).rejects.toThrow(ValidationError);
    });

    it('should reject invalid permissions', async () => {
      const input = {
        name: 'Invalid Role',
        permissions: ['invalid:permission'],
      };

      await expect(service.createRole(input)).rejects.toThrow(ValidationError);
    });

    it('should allow wildcard permission', async () => {
      const input = {
        name: 'Super Role',
        permissions: [WILDCARD_PERMISSION],
      };

      const role = await service.createRole(input);
      testRoleIds.push(role.id);

      expect(role.permissions).toContain(WILDCARD_PERMISSION);
    });
  });

  describe('updateRole', () => {
    it('should update role description', async () => {
      // Create a test role first
      const created = await service.createRole({
        name: 'Update Test Role',
        description: 'Original description',
        permissions: [PERMISSIONS.TASKS_VIEW],
      });
      testRoleIds.push(created.id);

      const updated = await service.updateRole(created.id, {
        description: 'Updated description',
      });

      expect(updated.description).toBe('Updated description');
    });

    it('should update role permissions', async () => {
      const created = await service.createRole({
        name: 'Permission Update Role',
        permissions: [PERMISSIONS.TASKS_VIEW],
      });
      testRoleIds.push(created.id);

      const updated = await service.updateRole(created.id, {
        permissions: [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE],
      });

      expect(updated.permissions).toContain(PERMISSIONS.TASKS_MANAGE);
    });

    it('should prevent renaming system roles', async () => {
      await expect(
        service.updateRole(SYSTEM_ROLE_IDS.ADMIN, { name: 'Super Admin' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('should allow updating system role permissions', async () => {
      // This should work - permissions can be changed
      const original = await service.getRoleById(SYSTEM_ROLE_IDS.STAFF);
      const updated = await service.updateRole(SYSTEM_ROLE_IDS.STAFF, {
        permissions: original.permissions,
      });

      expect(updated.id).toBe(SYSTEM_ROLE_IDS.STAFF);
    });
  });

  describe('deleteRole', () => {
    it('should delete custom role', async () => {
      const created = await service.createRole({
        name: 'Delete Test Role',
        permissions: [PERMISSIONS.TASKS_VIEW],
      });

      await service.deleteRole(created.id);

      await expect(service.getRoleById(created.id)).rejects.toThrow(NotFoundError);
    });

    it('should prevent deleting system roles', async () => {
      await expect(service.deleteRole(SYSTEM_ROLE_IDS.ADMIN)).rejects.toThrow(ForbiddenError);
      await expect(service.deleteRole(SYSTEM_ROLE_IDS.STAFF)).rejects.toThrow(ForbiddenError);
    });

    it('should prevent deleting role with assigned users', async () => {
      // Create a role and assign a user
      const created = await service.createRole({
        name: 'Role With Users',
        permissions: [PERMISSIONS.TASKS_VIEW],
      });
      testRoleIds.push(created.id);

      // Create a test staff member with this role
      const testStaffId = `test-staff-${Date.now()}`;
      await db.insert(staff).values({
        id: testStaffId,
        email: `test-${Date.now()}@test.com`,
        name: 'Test Staff',
        roleId: created.id,
        status: 'active',
      });

      try {
        await expect(service.deleteRole(created.id)).rejects.toThrow(ValidationError);
      } finally {
        // Clean up test staff
        await db.delete(staff).where(eq(staff.id, testStaffId));
      }
    });
  });

  describe('getRolePermissions', () => {
    it('should return permissions for a role', async () => {
      const permissions = await service.getRolePermissions(SYSTEM_ROLE_IDS.STAFF);

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions).toContain(PERMISSIONS.CONVERSATIONS_VIEW);
    });
  });

  describe('userHasPermission', () => {
    it('should return true when user has permission via role', async () => {
      // Get an admin user
      const [adminUser] = await db
        .select()
        .from(staff)
        .where(eq(staff.roleId, SYSTEM_ROLE_IDS.ADMIN))
        .limit(1);

      if (adminUser) {
        const result = await service.userHasPermission(adminUser.id, PERMISSIONS.ADMIN_MANAGE);
        expect(result).toBe(true);
      }
    });

    it('should return false for non-existent user', async () => {
      const result = await service.userHasPermission('non-existent-user', PERMISSIONS.TASKS_VIEW);
      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return wildcard for admin users', async () => {
      const [adminUser] = await db
        .select()
        .from(staff)
        .where(eq(staff.roleId, SYSTEM_ROLE_IDS.ADMIN))
        .limit(1);

      if (adminUser) {
        const permissions = await service.getUserPermissions(adminUser.id);
        expect(permissions).toContain(WILDCARD_PERMISSION);
      }
    });

    it('should return empty array for non-existent user', async () => {
      const permissions = await service.getUserPermissions('non-existent-user');
      expect(permissions).toEqual([]);
    });
  });
});
