/**
 * Auth Login Enforcement Tests
 *
 * Tests for email verification and admin approval enforcement during login.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, settings } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { authService } from '@/services/auth.js';
import { authSettingsService } from '@/services/auth-settings.js';

describe('Auth Login Enforcement', () => {
  const testPassword = 'test12345';

  beforeEach(async () => {
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  afterEach(async () => {
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  // Helper to create a test user with specific fields
  async function createTestUser(
    id: string,
    email: string,
    overrides: Record<string, unknown> = {}
  ) {
    await db.delete(staff).where(eq(staff.id, id));
    const passwordHash = await authService.hashPassword(testPassword);
    await db.insert(staff).values({
      id,
      email,
      name: 'Test User',
      roleId: SYSTEM_ROLE_IDS.STAFF,
      status: 'active',
      passwordHash,
      emailVerified: true,
      approvalStatus: 'approved',
      ...overrides,
    });
  }

  async function cleanupUser(id: string) {
    await db.delete(staff).where(eq(staff.id, id));
  }

  async function login(email: string, password: string = testPassword) {
    return app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }

  describe('Email verification enforcement', () => {
    it('should reject unverified user with instant verification', async () => {
      await authSettingsService.update({ emailVerification: 'instant' });
      await createTestUser('staff-enf-1', 'enf1@test.com', {
        emailVerified: false,
        status: 'active', // could happen if manually activated
      });

      const res = await login('enf1@test.com');
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toContain('verify your email');

      await cleanupUser('staff-enf-1');
    });

    it('should allow unverified user within grace period', async () => {
      await authSettingsService.update({
        emailVerification: 'grace',
        emailVerificationGraceDays: 7,
      });
      await createTestUser('staff-enf-2', 'enf2@test.com', {
        emailVerified: false,
        // createdAt is default (now), so within grace period
      });

      const res = await login('enf2@test.com');
      expect(res.status).toBe(200);

      await cleanupUser('staff-enf-2');
    });

    it('should reject unverified user past grace period', async () => {
      await authSettingsService.update({
        emailVerification: 'grace',
        emailVerificationGraceDays: 7,
      });
      // Create user with createdAt in the past (8 days ago)
      const pastDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await createTestUser('staff-enf-3', 'enf3@test.com', {
        emailVerified: false,
        createdAt: pastDate,
      });

      const res = await login('enf3@test.com');
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toContain('grace period');

      await cleanupUser('staff-enf-3');
    });

    it('should allow verified user regardless of settings', async () => {
      await authSettingsService.update({ emailVerification: 'instant' });
      await createTestUser('staff-enf-4', 'enf4@test.com', {
        emailVerified: true,
      });

      const res = await login('enf4@test.com');
      expect(res.status).toBe(200);

      await cleanupUser('staff-enf-4');
    });
  });

  describe('Approval status enforcement', () => {
    it('should reject pending-approval user', async () => {
      await createTestUser('staff-enf-5', 'enf5@test.com', {
        approvalStatus: 'pending',
      });

      const res = await login('enf5@test.com');
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toContain('pending approval');

      await cleanupUser('staff-enf-5');
    });

    it('should reject rejected user', async () => {
      await createTestUser('staff-enf-6', 'enf6@test.com', {
        approvalStatus: 'rejected',
      });

      const res = await login('enf6@test.com');
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toContain('rejected');

      await cleanupUser('staff-enf-6');
    });

    it('should allow approved user', async () => {
      await createTestUser('staff-enf-7', 'enf7@test.com', {
        approvalStatus: 'approved',
      });

      const res = await login('enf7@test.com');
      expect(res.status).toBe(200);

      await cleanupUser('staff-enf-7');
    });
  });

  describe('/auth/me includes verification info', () => {
    it('should include emailVerified in /auth/me response', async () => {
      await createTestUser('staff-enf-8', 'enf8@test.com', { emailVerified: true });

      const loginRes = await login('enf8@test.com');
      const { accessToken } = await loginRes.json();

      const meRes = await app.request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await meRes.json();

      expect(json.user.emailVerified).toBe(true);
      expect(json.user.emailVerificationDeadline).toBeNull();

      await cleanupUser('staff-enf-8');
    });

    it('should include emailVerificationDeadline for unverified grace period user', async () => {
      await authSettingsService.update({
        emailVerification: 'grace',
        emailVerificationGraceDays: 14,
      });
      await createTestUser('staff-enf-9', 'enf9@test.com', { emailVerified: false });

      const loginRes = await login('enf9@test.com');
      const { accessToken } = await loginRes.json();

      const meRes = await app.request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await meRes.json();

      expect(json.user.emailVerified).toBe(false);
      expect(json.user.emailVerificationDeadline).toBeDefined();
      expect(json.user.emailVerificationDeadline).not.toBeNull();

      // Deadline should be a valid future date
      const deadline = new Date(json.user.emailVerificationDeadline).getTime();
      expect(deadline).toBeGreaterThan(Date.now());

      await cleanupUser('staff-enf-9');
    });
  });
});
