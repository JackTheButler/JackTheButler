/**
 * Staff Service Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { db, staff, roles } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { StaffService } from '@/services/staff.js';
import { authService } from '@/services/auth.js';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';

describe('StaffService', () => {
  const service = new StaffService();

  // Test users
  const testAdminId = 'staff-svc-admin';
  const testStaffId = 'staff-svc-staff';

  beforeAll(async () => {
    // Clean up any existing test data
    await db.delete(staff).where(eq(staff.id, testAdminId));
    await db.delete(staff).where(eq(staff.id, testStaffId));

    // Create test users
    const passwordHash = await authService.hashPassword('test12345');
    await db.insert(staff).values([
      {
        id: testAdminId,
        email: 'staff-svc-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: testStaffId,
        email: 'staff-svc-staff@test.com',
        name: 'Staff User',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        department: 'Front Desk',
        status: 'active',
        passwordHash,
      },
    ]);
  });

  afterAll(async () => {
    // Clean up
    await db.delete(staff).where(eq(staff.id, testAdminId));
    await db.delete(staff).where(eq(staff.id, testStaffId));
  });

  describe('list', () => {
    it('should return all staff with role names', async () => {
      const result = await service.list();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const admin = result.find((s) => s.id === testAdminId);
      expect(admin).toBeDefined();
      expect(admin?.roleName).toBe('Admin');
    });

    it('should filter by status', async () => {
      const result = await service.list({ status: 'active' });

      expect(result.every((s) => s.status === 'active')).toBe(true);
    });

    it('should filter by roleId', async () => {
      const result = await service.list({ roleId: SYSTEM_ROLE_IDS.ADMIN });

      expect(result.every((s) => s.roleId === SYSTEM_ROLE_IDS.ADMIN)).toBe(true);
    });

    it('should search by name', async () => {
      const result = await service.list({ search: 'Staff User' });

      expect(result.some((s) => s.id === testStaffId)).toBe(true);
    });

    it('should search by email', async () => {
      const result = await service.list({ search: 'staff-svc-admin' });

      expect(result.some((s) => s.id === testAdminId)).toBe(true);
    });

    it('should respect limit and offset', async () => {
      const result = await service.list({ limit: 1 });

      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getById', () => {
    it('should return staff with role name', async () => {
      const result = await service.getById(testAdminId);

      expect(result.id).toBe(testAdminId);
      expect(result.email).toBe('staff-svc-admin@test.com');
      expect(result.roleName).toBe('Admin');
    });

    it('should throw NotFoundError for non-existent staff', async () => {
      await expect(service.getById('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('getByEmail', () => {
    it('should find staff by email', async () => {
      const result = await service.getByEmail('staff-svc-admin@test.com');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(testAdminId);
    });

    it('should return null for non-existent email', async () => {
      const result = await service.getByEmail('nonexistent@test.com');

      expect(result).toBeNull();
    });

    it('should be case-insensitive', async () => {
      const result = await service.getByEmail('STAFF-SVC-ADMIN@TEST.COM');

      expect(result).not.toBeNull();
    });
  });

  describe('create', () => {
    const newEmail = 'staff-svc-new@test.com';

    afterEach(async () => {
      await db.delete(staff).where(eq(staff.email, newEmail));
    });

    it('should create a new staff member', async () => {
      const result = await service.create({
        email: newEmail,
        name: 'New Staff',
        password: 'password123',
        roleId: SYSTEM_ROLE_IDS.VIEWER,
      });

      expect(result.email).toBe(newEmail);
      expect(result.name).toBe('New Staff');
      expect(result.roleId).toBe(SYSTEM_ROLE_IDS.VIEWER);
      expect(result.status).toBe('active');
    });

    it('should throw ValidationError for duplicate email', async () => {
      await expect(
        service.create({
          email: 'staff-svc-admin@test.com',
          name: 'Duplicate',
          password: 'password123',
          roleId: SYSTEM_ROLE_IDS.STAFF,
        })
      ).rejects.toThrow('email already exists');
    });

    it('should throw ValidationError for invalid role', async () => {
      await expect(
        service.create({
          email: newEmail,
          name: 'Invalid Role',
          password: 'password123',
          roleId: 'nonexistent-role',
        })
      ).rejects.toThrow('Invalid role ID');
    });

    it('should throw ValidationError for short password', async () => {
      await expect(
        service.create({
          email: newEmail,
          name: 'Short Password',
          password: 'short',
          roleId: SYSTEM_ROLE_IDS.STAFF,
        })
      ).rejects.toThrow('at least 8 characters');
    });
  });

  describe('update', () => {
    it('should update staff fields', async () => {
      const result = await service.update(testStaffId, {
        name: 'Updated Staff',
        department: 'Housekeeping',
      });

      expect(result.name).toBe('Updated Staff');
      expect(result.department).toBe('Housekeeping');

      // Restore
      await service.update(testStaffId, {
        name: 'Staff User',
        department: 'Front Desk',
      });
    });

    it('should update role', async () => {
      const result = await service.update(testStaffId, {
        roleId: SYSTEM_ROLE_IDS.VIEWER,
      });

      expect(result.roleId).toBe(SYSTEM_ROLE_IDS.VIEWER);

      // Restore
      await service.update(testStaffId, {
        roleId: SYSTEM_ROLE_IDS.STAFF,
      });
    });

    it('should throw ForbiddenError for self-demotion', async () => {
      await expect(
        service.update(testAdminId, { roleId: SYSTEM_ROLE_IDS.STAFF }, testAdminId)
      ).rejects.toThrow('Cannot remove your own admin access');
    });

    it('should throw ValidationError for invalid role', async () => {
      await expect(service.update(testStaffId, { roleId: 'nonexistent' })).rejects.toThrow(
        'Invalid role ID'
      );
    });
  });

  describe('deactivate', () => {
    it('should deactivate a staff member', async () => {
      const result = await service.deactivate(testStaffId);

      expect(result.status).toBe('inactive');

      // Restore
      await service.activate(testStaffId);
    });

    it('should throw ForbiddenError for self-deactivation', async () => {
      await expect(service.deactivate(testAdminId, testAdminId)).rejects.toThrow(
        'Cannot deactivate your own account'
      );
    });
  });

  describe('activate', () => {
    it('should activate a staff member', async () => {
      // First deactivate
      await service.deactivate(testStaffId);

      // Then activate
      const result = await service.activate(testStaffId);

      expect(result.status).toBe('active');
    });
  });

  describe('updatePassword', () => {
    it('should update password', async () => {
      await service.updatePassword(testStaffId, 'newpassword123');

      // Verify the hash is a bcrypt hash
      const [user] = await db.select().from(staff).where(eq(staff.id, testStaffId)).limit(1);
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);

      // Restore
      await service.updatePassword(testStaffId, 'test12345');
    });

    it('should throw ValidationError for short password', async () => {
      await expect(service.updatePassword(testStaffId, 'short')).rejects.toThrow(
        'at least 8 characters'
      );
    });
  });

  describe('getStats', () => {
    it('should return staff statistics', async () => {
      const stats = await service.getStats();

      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.active).toBeGreaterThanOrEqual(2);
      expect(typeof stats.inactive).toBe('number');
      expect(stats.byRole).toBeDefined();
    });
  });
});
