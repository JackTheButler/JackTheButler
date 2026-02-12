/**
 * Permission Middleware Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { db, staff, roles } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { PERMISSIONS, WILDCARD_PERMISSION } from '@/core/permissions/index.js';
import { requireAuth, requirePermission, requireAnyPermission } from '@/gateway/middleware/auth.js';
import { errorHandler } from '@/gateway/middleware/error-handler.js';
import { AuthService } from '@/services/auth.js';

describe('Permission Middleware', () => {
  const authService = new AuthService();

  // Test users
  const adminUserId = 'staff-perm-admin';
  const staffUserId = 'staff-perm-staff';
  const viewerUserId = 'staff-perm-viewer';
  const customUserId = 'staff-perm-custom';
  const customRoleId = 'role-perm-custom';

  let adminToken: string;
  let staffToken: string;
  let viewerToken: string;
  let customToken: string;

  // Create a test app with permission-protected routes
  const testApp = new Hono();

  // Add error handler so errors return proper HTTP responses
  testApp.onError(errorHandler);

  testApp.use('*', requireAuth);

  testApp.get('/tasks', requirePermission(PERMISSIONS.TASKS_VIEW), (c) => {
    return c.json({ success: true, route: 'tasks:view' });
  });

  testApp.post('/tasks', requirePermission(PERMISSIONS.TASKS_MANAGE), (c) => {
    return c.json({ success: true, route: 'tasks:manage' });
  });

  testApp.get('/admin', requirePermission(PERMISSIONS.ADMIN_MANAGE), (c) => {
    return c.json({ success: true, route: 'admin:manage' });
  });

  testApp.get(
    '/multi-perm',
    requirePermission(PERMISSIONS.TASKS_VIEW, PERMISSIONS.GUESTS_VIEW),
    (c) => {
      return c.json({ success: true, route: 'multi' });
    }
  );

  testApp.get(
    '/any-perm',
    requireAnyPermission(PERMISSIONS.ADMIN_MANAGE, PERMISSIONS.TASKS_VIEW),
    (c) => {
      return c.json({ success: true, route: 'any' });
    }
  );

  beforeAll(async () => {
    // Clean up any existing test data
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(staff).where(eq(staff.id, viewerUserId));
    await db.delete(staff).where(eq(staff.id, customUserId));
    await db.delete(roles).where(eq(roles.id, customRoleId));

    // Create custom role with only tasks:view permission
    await db.insert(roles).values({
      id: customRoleId,
      name: 'Custom Test Role',
      description: 'For permission middleware testing',
      permissions: JSON.stringify([PERMISSIONS.TASKS_VIEW]),
      isSystem: false,
    });

    // Create test users with different roles
    const passwordHash = await authService.hashPassword('test123');
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'perm-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: staffUserId,
        email: 'perm-staff@test.com',
        name: 'Staff User',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'active',
        passwordHash,
      },
      {
        id: viewerUserId,
        email: 'perm-viewer@test.com',
        name: 'Viewer User',
        roleId: SYSTEM_ROLE_IDS.VIEWER,
        status: 'active',
        passwordHash,
      },
      {
        id: customUserId,
        email: 'perm-custom@test.com',
        name: 'Custom User',
        roleId: customRoleId,
        status: 'active',
        passwordHash,
      },
    ]);

    // Get tokens for each user
    const adminTokens = await authService.login('perm-admin@test.com', 'test123');
    const staffTokens = await authService.login('perm-staff@test.com', 'test123');
    const viewerTokens = await authService.login('perm-viewer@test.com', 'test123');
    const customTokens = await authService.login('perm-custom@test.com', 'test123');

    adminToken = adminTokens.accessToken;
    staffToken = staffTokens.accessToken;
    viewerToken = viewerTokens.accessToken;
    customToken = customTokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(staff).where(eq(staff.id, viewerUserId));
    await db.delete(staff).where(eq(staff.id, customUserId));
    await db.delete(roles).where(eq(roles.id, customRoleId));
  });

  describe('requirePermission', () => {
    describe('Admin user (wildcard permission)', () => {
      it('should allow access to any route', async () => {
        const res1 = await testApp.request('/tasks', {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(res1.status).toBe(200);

        const res2 = await testApp.request('/admin', {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(res2.status).toBe(200);
      });
    });

    describe('Staff user (limited permissions)', () => {
      it('should allow access to tasks:view', async () => {
        const res = await testApp.request('/tasks', {
          headers: { Authorization: `Bearer ${staffToken}` },
        });
        expect(res.status).toBe(200);
      });

      it('should allow access to tasks:manage', async () => {
        const res = await testApp.request('/tasks', {
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken}` },
        });
        expect(res.status).toBe(200);
      });

      it('should deny access to admin:manage', async () => {
        const res = await testApp.request('/admin', {
          headers: { Authorization: `Bearer ${staffToken}` },
        });
        expect(res.status).toBe(403);
      });
    });

    describe('Viewer user (view-only permissions)', () => {
      it('should allow access to tasks:view', async () => {
        const res = await testApp.request('/tasks', {
          headers: { Authorization: `Bearer ${viewerToken}` },
        });
        expect(res.status).toBe(200);
      });

      it('should deny access to tasks:manage', async () => {
        const res = await testApp.request('/tasks', {
          method: 'POST',
          headers: { Authorization: `Bearer ${viewerToken}` },
        });
        expect(res.status).toBe(403);
      });

      it('should deny access to admin:manage', async () => {
        const res = await testApp.request('/admin', {
          headers: { Authorization: `Bearer ${viewerToken}` },
        });
        expect(res.status).toBe(403);
      });
    });

    describe('Custom user (tasks:view only)', () => {
      it('should allow access to tasks:view', async () => {
        const res = await testApp.request('/tasks', {
          headers: { Authorization: `Bearer ${customToken}` },
        });
        expect(res.status).toBe(200);
      });

      it('should deny access to tasks:manage', async () => {
        const res = await testApp.request('/tasks', {
          method: 'POST',
          headers: { Authorization: `Bearer ${customToken}` },
        });
        expect(res.status).toBe(403);
      });
    });

    describe('Multiple permissions required (AND logic)', () => {
      it('should allow admin (has all via wildcard)', async () => {
        const res = await testApp.request('/multi-perm', {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(res.status).toBe(200);
      });

      it('should allow staff (has both tasks:view and guests:view)', async () => {
        const res = await testApp.request('/multi-perm', {
          headers: { Authorization: `Bearer ${staffToken}` },
        });
        expect(res.status).toBe(200);
      });

      it('should deny custom user (only has tasks:view, not guests:view)', async () => {
        const res = await testApp.request('/multi-perm', {
          headers: { Authorization: `Bearer ${customToken}` },
        });
        expect(res.status).toBe(403);
      });
    });
  });

  describe('requireAnyPermission', () => {
    it('should allow user with first permission', async () => {
      const res = await testApp.request('/any-perm', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
    });

    it('should allow user with second permission', async () => {
      const res = await testApp.request('/any-perm', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
    });

    it('should allow custom user (has tasks:view)', async () => {
      const res = await testApp.request('/any-perm', {
        headers: { Authorization: `Bearer ${customToken}` },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('No authentication', () => {
    it('should return 401 without token', async () => {
      const res = await testApp.request('/tasks');
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await testApp.request('/tasks', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });
  });
});
