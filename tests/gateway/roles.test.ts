/**
 * Roles API Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, roles } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { PERMISSIONS } from '@/core/permissions/index.js';
import { AuthService } from '@/services/auth.js';

describe('Roles API', () => {
  const authService = new AuthService();

  // Test users
  const adminUserId = 'staff-roles-admin';
  const staffUserId = 'staff-roles-staff';
  const customRoleId = 'role-api-test-custom';

  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(roles).where(eq(roles.id, customRoleId));

    // Create test users
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'roles-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash: 'test123',
      },
      {
        id: staffUserId,
        email: 'roles-staff@test.com',
        name: 'Staff User',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'active',
        passwordHash: 'test123',
      },
    ]);

    // Get tokens
    const adminTokens = await authService.login('roles-admin@test.com', 'test123');
    const staffTokens = await authService.login('roles-staff@test.com', 'test123');

    adminToken = adminTokens.accessToken;
    staffToken = staffTokens.accessToken;
  });

  afterAll(async () => {
    // Clean up
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(roles).where(eq(roles.id, customRoleId));
  });

  describe('GET /api/v1/roles', () => {
    it('should return all roles for admin', async () => {
      const res = await app.request('/api/v1/roles', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.roles).toBeDefined();
      expect(Array.isArray(json.roles)).toBe(true);
      expect(json.roles.length).toBeGreaterThanOrEqual(4); // At least 4 default roles
    });

    it('should include user counts', async () => {
      const res = await app.request('/api/v1/roles', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      const adminRole = json.roles.find((r: { id: string }) => r.id === SYSTEM_ROLE_IDS.ADMIN);
      expect(adminRole).toBeDefined();
      expect(typeof adminRole.userCount).toBe('number');
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request('/api/v1/roles', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const res = await app.request('/api/v1/roles');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/roles/:id', () => {
    it('should return a specific role', async () => {
      const res = await app.request(`/api/v1/roles/${SYSTEM_ROLE_IDS.ADMIN}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.role.id).toBe(SYSTEM_ROLE_IDS.ADMIN);
      expect(json.role.name).toBe('Admin');
      expect(json.role.permissions).toContain('*');
    });

    it('should return 404 for non-existent role', async () => {
      const res = await app.request('/api/v1/roles/nonexistent-role', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request(`/api/v1/roles/${SYSTEM_ROLE_IDS.STAFF}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/roles', () => {
    it('should create a new role', async () => {
      const res = await app.request('/api/v1/roles', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'API Test Role',
          description: 'Created via API test',
          permissions: [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE],
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.role.name).toBe('API Test Role');
      expect(json.role.description).toBe('Created via API test');
      expect(json.role.permissions).toContain(PERMISSIONS.TASKS_VIEW);
      expect(json.role.isSystem).toBe(false);

      // Clean up
      await db.delete(roles).where(eq(roles.id, json.role.id));
    });

    it('should reject duplicate role names', async () => {
      const res = await app.request('/api/v1/roles', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Admin', // Already exists
          permissions: [PERMISSIONS.TASKS_VIEW],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid permissions', async () => {
      const res = await app.request('/api/v1/roles', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Invalid Role',
          permissions: ['invalid:permission'],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject empty permissions array', async () => {
      const res = await app.request('/api/v1/roles', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Empty Perms Role',
          permissions: [],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request('/api/v1/roles', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${staffToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Should Not Create',
          permissions: [PERMISSIONS.TASKS_VIEW],
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/roles/:id', () => {
    beforeAll(async () => {
      // Create a custom role for update tests
      await db.insert(roles).values({
        id: customRoleId,
        name: 'Update Test Role',
        description: 'For update testing',
        permissions: JSON.stringify([PERMISSIONS.TASKS_VIEW]),
        isSystem: false,
      });
    });

    it('should update a custom role', async () => {
      const res = await app.request(`/api/v1/roles/${customRoleId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Updated description',
          permissions: [PERMISSIONS.TASKS_VIEW, PERMISSIONS.GUESTS_VIEW],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.role.description).toBe('Updated description');
      expect(json.role.permissions).toContain(PERMISSIONS.GUESTS_VIEW);
    });

    it('should prevent renaming system roles', async () => {
      const res = await app.request(`/api/v1/roles/${SYSTEM_ROLE_IDS.ADMIN}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Admin Name',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('should allow updating system role permissions', async () => {
      // Get current permissions first
      const getRes = await app.request(`/api/v1/roles/${SYSTEM_ROLE_IDS.VIEWER}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const viewerRole = (await getRes.json()).role;

      const res = await app.request(`/api/v1/roles/${SYSTEM_ROLE_IDS.VIEWER}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          permissions: [...viewerRole.permissions, PERMISSIONS.APPROVALS_VIEW],
        }),
      });

      expect(res.status).toBe(200);

      // Restore original permissions
      await app.request(`/api/v1/roles/${SYSTEM_ROLE_IDS.VIEWER}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          permissions: viewerRole.permissions,
        }),
      });
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request(`/api/v1/roles/${customRoleId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${staffToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Should not update',
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/roles/:id', () => {
    it('should delete a custom role with no users', async () => {
      // Create a role to delete
      const createRes = await app.request('/api/v1/roles', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'To Be Deleted',
          permissions: [PERMISSIONS.TASKS_VIEW],
        }),
      });

      const { role } = await createRes.json();

      const res = await app.request(`/api/v1/roles/${role.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('should prevent deleting system roles', async () => {
      const res = await app.request(`/api/v1/roles/${SYSTEM_ROLE_IDS.ADMIN}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(403);
    });

    it('should prevent deleting roles with assigned users', async () => {
      // Create a role and assign a user to it
      const createRes = await app.request('/api/v1/roles', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Role With User',
          permissions: [PERMISSIONS.TASKS_VIEW],
        }),
      });

      const { role } = await createRes.json();

      // Create a user with this role
      const testUserId = 'staff-delete-test-user';
      await db.insert(staff).values({
        id: testUserId,
        email: 'delete-test@test.com',
        name: 'Delete Test User',
        roleId: role.id,
        status: 'active',
        passwordHash: 'test123',
      });

      // Try to delete - should fail
      const res = await app.request(`/api/v1/roles/${role.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);

      // Clean up
      await db.delete(staff).where(eq(staff.id, testUserId));
      await db.delete(roles).where(eq(roles.id, role.id));
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request(`/api/v1/roles/${customRoleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/permissions', () => {
    it('should return all permissions with metadata', async () => {
      const res = await app.request('/api/v1/permissions', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.permissions).toBeDefined();
      expect(Array.isArray(json.permissions)).toBe(true);
      expect(json.permissions.length).toBe(18); // 9 groups x 2 (view + manage)

      expect(json.groups).toBeDefined();
      expect(Array.isArray(json.groups)).toBe(true);

      expect(json.all).toBeDefined();
      expect(Array.isArray(json.all)).toBe(true);

      expect(json.wildcard).toBe('*');
    });

    it('should include permission definitions', async () => {
      const res = await app.request('/api/v1/permissions', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      const taskViewPerm = json.permissions.find(
        (p: { key: string }) => p.key === PERMISSIONS.TASKS_VIEW
      );

      expect(taskViewPerm).toBeDefined();
      expect(taskViewPerm.label).toBe('View Tasks');
      expect(taskViewPerm.description).toBeDefined();
      expect(taskViewPerm.group).toBe('tasks');
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request('/api/v1/permissions', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });
  });
});
