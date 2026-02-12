/**
 * Auth Settings API Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, settings } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { authService } from '@/services/auth.js';

describe('Auth Settings API', () => {
  const adminUserId = 'auth-settings-api-admin';
  const staffUserId = 'auth-settings-api-staff';
  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));

    const passwordHash = await authService.hashPassword('test12345');
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'auth-settings-admin@test.com',
        name: 'Auth Settings Admin',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: staffUserId,
        email: 'auth-settings-staff@test.com',
        name: 'Auth Settings Staff',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'active',
        passwordHash,
      },
    ]);

    const adminLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'auth-settings-admin@test.com', password: 'test12345' }),
    });
    adminToken = (await adminLogin.json()).accessToken;

    const staffLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'auth-settings-staff@test.com', password: 'test12345' }),
    });
    staffToken = (await staffLogin.json()).accessToken;
  });

  afterAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  beforeEach(async () => {
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  describe('GET /api/v1/settings/auth', () => {
    it('should return defaults when no settings configured', async () => {
      const res = await app.request('/api/v1/settings/auth', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.settings.registrationEnabled).toBe(false);
      expect(json.settings.emailVerification).toBe('instant');
      expect(json.settings.emailVerificationGraceDays).toBe(7);
      expect(json.settings.requireAdminApproval).toBe(false);
      expect(json.settings.defaultRoleId).toBeDefined();
    });

    it('should require auth', async () => {
      const res = await app.request('/api/v1/settings/auth');
      expect(res.status).toBe(401);
    });

    it('should require admin permission', async () => {
      const res = await app.request('/api/v1/settings/auth', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/settings/auth', () => {
    it('should update settings', async () => {
      const res = await app.request('/api/v1/settings/auth', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          registrationEnabled: true,
          emailVerification: 'grace',
          emailVerificationGraceDays: 14,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.settings.registrationEnabled).toBe(true);
      expect(json.settings.emailVerification).toBe('grace');
      expect(json.settings.emailVerificationGraceDays).toBe(14);
    });

    it('should persist and return updated settings on GET', async () => {
      // Update
      await app.request('/api/v1/settings/auth', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          registrationEnabled: true,
          requireAdminApproval: true,
        }),
      });

      // Verify via GET
      const res = await app.request('/api/v1/settings/auth', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      expect(json.settings.registrationEnabled).toBe(true);
      expect(json.settings.requireAdminApproval).toBe(true);
    });

    it('should reject invalid emailVerification value', async () => {
      const res = await app.request('/api/v1/settings/auth', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          emailVerification: 'invalid',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject grace days out of range', async () => {
      const res = await app.request('/api/v1/settings/auth', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          emailVerificationGraceDays: 0,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should require admin:manage permission', async () => {
      const res = await app.request('/api/v1/settings/auth', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({ registrationEnabled: true }),
      });

      expect(res.status).toBe(403);
    });
  });
});
