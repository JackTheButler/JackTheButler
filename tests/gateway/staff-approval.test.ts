/**
 * Staff Approval API Tests
 *
 * Tests for approve/reject endpoints and approvalStatus filtering.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, settings } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { authService } from '@/services/auth.js';
import { authSettingsService } from '@/services/auth-settings.js';

describe('Staff Approval API', () => {
  const adminUserId = 'staff-approval-admin';
  const adminEmail = 'approval-admin@test.com';
  let adminToken: string;

  beforeAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));

    const passwordHash = await authService.hashPassword('test12345');
    await db.insert(staff).values({
      id: adminUserId,
      email: adminEmail,
      name: 'Approval Admin',
      roleId: SYSTEM_ROLE_IDS.ADMIN,
      status: 'active',
      passwordHash,
    });

    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'test12345' }),
    });
    const { accessToken } = await loginRes.json();
    adminToken = accessToken;
  });

  afterAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  // Cleanup helper
  const testUserIds: string[] = [];
  afterEach(async () => {
    for (const id of testUserIds) {
      await db.delete(staff).where(eq(staff.id, id));
    }
    testUserIds.length = 0;
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  async function createPendingUser(id: string, email: string, overrides: Record<string, unknown> = {}) {
    await db.delete(staff).where(eq(staff.id, id));
    const passwordHash = await authService.hashPassword('test12345');
    await db.insert(staff).values({
      id,
      email,
      name: 'Pending User',
      roleId: SYSTEM_ROLE_IDS.STAFF,
      status: 'inactive',
      passwordHash,
      emailVerified: false,
      approvalStatus: 'pending',
      ...overrides,
    });
    testUserIds.push(id);
  }

  // ===================
  // Approve
  // ===================

  describe('POST /api/v1/staff/:id/approve', () => {
    it('should approve and activate verified user', async () => {
      await createPendingUser('staff-appr-1', 'appr1@test.com', {
        emailVerified: true,
      });

      const res = await app.request('/api/v1/staff/staff-appr-1/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.staff.id).toBe('staff-appr-1');

      // Verify in DB
      const [user] = await db.select().from(staff).where(eq(staff.id, 'staff-appr-1'));
      expect(user.approvalStatus).toBe('approved');
      expect(user.status).toBe('active'); // activated because email is verified
    });

    it('should approve and activate user when grace period verification', async () => {
      await authSettingsService.update({ emailVerification: 'grace' });
      await createPendingUser('staff-appr-2', 'appr2@test.com', {
        emailVerified: false,
      });

      const res = await app.request('/api/v1/staff/staff-appr-2/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);

      const [user] = await db.select().from(staff).where(eq(staff.id, 'staff-appr-2'));
      expect(user.approvalStatus).toBe('approved');
      expect(user.status).toBe('active'); // grace mode = activate immediately
    });

    it('should approve but NOT activate when instant verification and email unverified', async () => {
      await authSettingsService.update({ emailVerification: 'instant' });
      await createPendingUser('staff-appr-3', 'appr3@test.com', {
        emailVerified: false,
      });

      const res = await app.request('/api/v1/staff/staff-appr-3/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);

      const [user] = await db.select().from(staff).where(eq(staff.id, 'staff-appr-3'));
      expect(user.approvalStatus).toBe('approved');
      expect(user.status).toBe('inactive'); // still inactive: needs email verification first
    });

    it('should return 400 if user is not pending', async () => {
      await createPendingUser('staff-appr-4', 'appr4@test.com', {
        approvalStatus: 'approved',
      });

      const res = await app.request('/api/v1/staff/staff-appr-4/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await app.request('/api/v1/staff/nonexistent/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });

    it('should require auth', async () => {
      const res = await app.request('/api/v1/staff/some-id/approve', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });
  });

  // ===================
  // Reject
  // ===================

  describe('POST /api/v1/staff/:id/reject', () => {
    it('should reject a pending user', async () => {
      await createPendingUser('staff-rej-1', 'rej1@test.com');

      const res = await app.request('/api/v1/staff/staff-rej-1/reject', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);

      const [user] = await db.select().from(staff).where(eq(staff.id, 'staff-rej-1'));
      expect(user.approvalStatus).toBe('rejected');
      expect(user.status).toBe('inactive');
    });

    it('should return 400 if user is not pending', async () => {
      await createPendingUser('staff-rej-2', 'rej2@test.com', {
        approvalStatus: 'approved',
      });

      const res = await app.request('/api/v1/staff/staff-rej-2/reject', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await app.request('/api/v1/staff/nonexistent/reject', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  // ===================
  // Filter by approvalStatus
  // ===================

  describe('GET /api/v1/staff?approvalStatus=pending', () => {
    it('should filter staff by approvalStatus', async () => {
      await createPendingUser('staff-filter-1', 'filter1@test.com');
      await createPendingUser('staff-filter-2', 'filter2@test.com', {
        approvalStatus: 'approved',
        status: 'active',
      });

      const res = await app.request('/api/v1/staff?approvalStatus=pending', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();

      // Should include the pending user but not the approved one
      const ids = json.staff.map((s: { id: string }) => s.id);
      expect(ids).toContain('staff-filter-1');
      expect(ids).not.toContain('staff-filter-2');
    });
  });
});
