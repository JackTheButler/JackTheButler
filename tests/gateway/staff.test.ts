/**
 * Staff API Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, roles } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { PERMISSIONS } from '@/core/permissions/index.js';
import { AuthService } from '@/services/auth.js';

describe('Staff API', () => {
  const authService = new AuthService();

  // Test users
  const adminUserId = 'staff-api-admin';
  const staffUserId = 'staff-api-staff';
  const targetUserId = 'staff-api-target';

  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(staff).where(eq(staff.id, targetUserId));

    // Create test users
    const passwordHash = await authService.hashPassword('test123');
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'staff-api-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: staffUserId,
        email: 'staff-api-staff@test.com',
        name: 'Staff User',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'active',
        passwordHash,
      },
      {
        id: targetUserId,
        email: 'staff-api-target@test.com',
        name: 'Target User',
        roleId: SYSTEM_ROLE_IDS.VIEWER,
        status: 'active',
        passwordHash,
      },
    ]);

    // Get tokens
    const adminTokens = await authService.login('staff-api-admin@test.com', 'test123');
    const staffTokens = await authService.login('staff-api-staff@test.com', 'test123');

    adminToken = adminTokens.accessToken;
    staffToken = staffTokens.accessToken;
  });

  afterAll(async () => {
    // Clean up
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(staff).where(eq(staff.id, targetUserId));
  });

  describe('GET /api/v1/staff', () => {
    it('should return all staff for admin', async () => {
      const res = await app.request('/api/v1/staff', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.staff).toBeDefined();
      expect(Array.isArray(json.staff)).toBe(true);
      expect(json.staff.length).toBeGreaterThanOrEqual(3);
    });

    it('should include role names', async () => {
      const res = await app.request('/api/v1/staff', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      const targetStaff = json.staff.find((s: { id: string }) => s.id === targetUserId);
      expect(targetStaff).toBeDefined();
      expect(targetStaff.roleName).toBe('Viewer');
    });

    it('should filter by status', async () => {
      const res = await app.request('/api/v1/staff?status=active', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.staff.every((s: { status: string }) => s.status === 'active')).toBe(true);
    });

    it('should filter by roleId', async () => {
      const res = await app.request(`/api/v1/staff?roleId=${SYSTEM_ROLE_IDS.ADMIN}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.staff.every((s: { roleId: string }) => s.roleId === SYSTEM_ROLE_IDS.ADMIN)).toBe(
        true
      );
    });

    it('should search by name or email', async () => {
      const res = await app.request('/api/v1/staff?search=target', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.staff.some((s: { id: string }) => s.id === targetUserId)).toBe(true);
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request('/api/v1/staff', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const res = await app.request('/api/v1/staff');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/staff/stats', () => {
    it('should return staff statistics', async () => {
      const res = await app.request('/api/v1/staff/stats', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total).toBeGreaterThanOrEqual(3);
      expect(json.active).toBeGreaterThanOrEqual(3);
      expect(json.byRole).toBeDefined();
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request('/api/v1/staff/stats', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/staff/:id', () => {
    it('should return a specific staff member', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.staff.id).toBe(targetUserId);
      expect(json.staff.email).toBe('staff-api-target@test.com');
      expect(json.staff.roleName).toBe('Viewer');
    });

    it('should return 404 for non-existent staff', async () => {
      const res = await app.request('/api/v1/staff/nonexistent-staff', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/staff', () => {
    const newStaffId = 'staff-api-new';

    afterEach(async () => {
      // Clean up created staff
      await db.delete(staff).where(eq(staff.email, 'new-staff@test.com'));
    });

    it('should create a new staff member', async () => {
      const res = await app.request('/api/v1/staff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'new-staff@test.com',
          name: 'New Staff Member',
          password: 'password123',
          roleId: SYSTEM_ROLE_IDS.STAFF,
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.staff.email).toBe('new-staff@test.com');
      expect(json.staff.name).toBe('New Staff Member');
      expect(json.staff.roleName).toBe('Staff');
      expect(json.staff.status).toBe('active');
    });

    it('should reject duplicate email', async () => {
      const res = await app.request('/api/v1/staff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'staff-api-admin@test.com', // Already exists
          name: 'Duplicate',
          password: 'password123',
          roleId: SYSTEM_ROLE_IDS.STAFF,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const res = await app.request('/api/v1/staff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'not-an-email',
          name: 'Invalid',
          password: 'password123',
          roleId: SYSTEM_ROLE_IDS.STAFF,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await app.request('/api/v1/staff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'new-staff@test.com',
          name: 'Short Password',
          password: 'short', // Less than 8 chars
          roleId: SYSTEM_ROLE_IDS.STAFF,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid role ID', async () => {
      const res = await app.request('/api/v1/staff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'new-staff@test.com',
          name: 'Invalid Role',
          password: 'password123',
          roleId: 'nonexistent-role',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request('/api/v1/staff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${staffToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'new-staff@test.com',
          name: 'Should Not Create',
          password: 'password123',
          roleId: SYSTEM_ROLE_IDS.STAFF,
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/staff/:id', () => {
    it('should update a staff member', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Target User',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.staff.name).toBe('Updated Target User');

      // Restore original name
      await app.request(`/api/v1/staff/${targetUserId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Target User',
        }),
      });
    });

    it('should change role', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roleId: SYSTEM_ROLE_IDS.STAFF,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.staff.roleId).toBe(SYSTEM_ROLE_IDS.STAFF);

      // Restore original role
      await app.request(`/api/v1/staff/${targetUserId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roleId: SYSTEM_ROLE_IDS.VIEWER,
        }),
      });
    });

    it('should prevent self-demotion from admin', async () => {
      const res = await app.request(`/api/v1/staff/${adminUserId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roleId: SYSTEM_ROLE_IDS.STAFF, // Trying to demote self from admin
        }),
      });

      expect(res.status).toBe(403);
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${staffToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Should Not Update',
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/staff/:id/password', () => {
    it('should update password', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}/password`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: 'newpassword123',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Restore original password
      await app.request(`/api/v1/staff/${targetUserId}/password`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: 'test123',
        }),
      });
    });

    it('should reject short password', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}/password`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: 'short',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}/password`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${staffToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: 'shouldnotwork',
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/staff/:id/deactivate', () => {
    it('should deactivate a staff member', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.staff.status).toBe('inactive');

      // Reactivate for other tests
      await app.request(`/api/v1/staff/${targetUserId}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    });

    it('should prevent self-deactivation', async () => {
      const res = await app.request(`/api/v1/staff/${adminUserId}/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(403);
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/staff/:id/activate', () => {
    it('should activate a staff member', async () => {
      // First deactivate
      await app.request(`/api/v1/staff/${targetUserId}/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // Then activate
      const res = await app.request(`/api/v1/staff/${targetUserId}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.staff.status).toBe('active');
    });

    it('should deny access to non-admin users', async () => {
      const res = await app.request(`/api/v1/staff/${targetUserId}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(res.status).toBe(403);
    });
  });
});
