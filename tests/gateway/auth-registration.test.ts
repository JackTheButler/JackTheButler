/**
 * Auth Registration, Password Recovery & Email Verification Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, settings, authTokens } from '@/db/index.js';
import { eq, and } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { authService } from '@/services/auth.js';
import { authSettingsService } from '@/services/auth-settings.js';
import { authTokenService } from '@/services/auth-token.js';

describe('Auth Registration & Recovery', () => {
  const adminUserId = 'staff-reg-test-admin';
  const adminEmail = 'reg-test-admin@test.com';
  let adminToken: string;

  // Create admin user for tests that need auth
  beforeAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));

    const passwordHash = await authService.hashPassword('test12345');
    await db.insert(staff).values({
      id: adminUserId,
      email: adminEmail,
      name: 'Reg Test Admin',
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
  });

  // Clean auth settings and registered test users between tests
  beforeEach(async () => {
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  afterEach(async () => {
    // Clean up test registrations
    await db.delete(staff).where(eq(staff.email, 'newuser@test.com'));
    await db.delete(staff).where(eq(staff.email, 'newuser2@test.com'));
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  // ===================
  // Registration
  // ===================

  describe('POST /api/v1/auth/register', () => {
    it('should return 403 when registration is disabled', async () => {
      // Registration is disabled by default
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'newuser@test.com',
          password: 'password123',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('should register when enabled with grace period (active status)', async () => {
      await authSettingsService.update({
        registrationEnabled: true,
        emailVerification: 'grace',
      });

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'newuser@test.com',
          password: 'password123',
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.requiresVerification).toBe(true);
      expect(json.requiresApproval).toBe(false);

      // Verify user was created with correct fields
      const [user] = await db.select().from(staff).where(eq(staff.email, 'newuser@test.com'));
      expect(user).toBeDefined();
      expect(user.status).toBe('active'); // grace period = active immediately
      expect(user.emailVerified).toBe(false);
      expect(user.approvalStatus).toBe('approved');
    });

    it('should register with instant verification (inactive status)', async () => {
      await authSettingsService.update({
        registrationEnabled: true,
        emailVerification: 'instant',
      });

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'newuser@test.com',
          password: 'password123',
        }),
      });

      expect(res.status).toBe(201);

      const [user] = await db.select().from(staff).where(eq(staff.email, 'newuser@test.com'));
      expect(user.status).toBe('inactive'); // instant = inactive until verified
      expect(user.emailVerified).toBe(false);
    });

    it('should register with admin approval required (inactive, pending)', async () => {
      await authSettingsService.update({
        registrationEnabled: true,
        emailVerification: 'grace',
        requireAdminApproval: true,
      });

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'newuser@test.com',
          password: 'password123',
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.requiresApproval).toBe(true);

      const [user] = await db.select().from(staff).where(eq(staff.email, 'newuser@test.com'));
      expect(user.status).toBe('inactive');
      expect(user.approvalStatus).toBe('pending');
    });

    it('should return 409 for duplicate email', async () => {
      await authSettingsService.update({ registrationEnabled: true });

      // First registration
      await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'newuser@test.com',
          password: 'password123',
        }),
      });

      // Duplicate
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Another User',
          email: 'newuser@test.com',
          password: 'password123',
        }),
      });

      expect(res.status).toBe(409);
    });

    it('should return 400 for invalid input', async () => {
      await authSettingsService.update({ registrationEnabled: true });

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'not-an-email',
          password: 'short',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should create a verification token on registration', async () => {
      await authSettingsService.update({ registrationEnabled: true });

      await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'newuser@test.com',
          password: 'password123',
        }),
      });

      const [user] = await db.select().from(staff).where(eq(staff.email, 'newuser@test.com'));
      const tokens = await db
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.staffId, user.id), eq(authTokens.type, 'email_verification')));

      expect(tokens.length).toBe(1);
    });
  });

  // ===================
  // Forgot Password
  // ===================

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return success for existing email', async () => {
      const res = await app.request('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify token was created
      const tokens = await db
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.staffId, adminUserId), eq(authTokens.type, 'password_reset')));
      expect(tokens.length).toBeGreaterThanOrEqual(1);
    });

    it('should return success for unknown email (no enumeration)', async () => {
      const res = await app.request('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'unknown@test.com' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  // ===================
  // Reset Password
  // ===================

  describe('POST /api/v1/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      // Create a reset token
      const token = await authTokenService.createToken(adminUserId, 'password_reset');

      const res = await app.request('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: 'newpassword123' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify new password works
      const loginRes = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: 'newpassword123' }),
      });
      expect(loginRes.status).toBe(200);

      // Restore original password
      const passwordHash = await authService.hashPassword('test12345');
      await db.update(staff).set({ passwordHash }).where(eq(staff.id, adminUserId)).run();
    });

    it('should reject invalid token', async () => {
      const res = await app.request('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token', password: 'newpassword123' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const token = await authTokenService.createToken(adminUserId, 'password_reset');

      const res = await app.request('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: 'short' }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ===================
  // Verify Email
  // ===================

  describe('POST /api/v1/auth/verify-email', () => {
    it('should verify email and activate account', async () => {
      // Create a user with emailVerified=false, status=inactive, approved
      const testId = 'staff-verify-test';
      const passwordHash = await authService.hashPassword('test12345');
      await db.delete(staff).where(eq(staff.id, testId));
      await db.insert(staff).values({
        id: testId,
        email: 'verify-test@test.com',
        name: 'Verify Test',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'inactive',
        passwordHash,
        emailVerified: false,
        approvalStatus: 'approved',
      });

      const token = await authTokenService.createToken(testId, 'email_verification');

      const res = await app.request('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify user is now verified and active
      const [user] = await db.select().from(staff).where(eq(staff.id, testId));
      expect(user.emailVerified).toBe(true);
      expect(user.status).toBe('active'); // activated because approved

      // Cleanup
      await db.delete(authTokens).where(eq(authTokens.staffId, testId));
      await db.delete(staff).where(eq(staff.id, testId));
    });

    it('should verify email but NOT activate when approval pending', async () => {
      const testId = 'staff-verify-pending';
      const passwordHash = await authService.hashPassword('test12345');
      await db.delete(staff).where(eq(staff.id, testId));
      await db.insert(staff).values({
        id: testId,
        email: 'verify-pending@test.com',
        name: 'Verify Pending',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'inactive',
        passwordHash,
        emailVerified: false,
        approvalStatus: 'pending',
      });

      const token = await authTokenService.createToken(testId, 'email_verification');

      const res = await app.request('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      expect(res.status).toBe(200);

      // Email verified, but still inactive (pending approval)
      const [user] = await db.select().from(staff).where(eq(staff.id, testId));
      expect(user.emailVerified).toBe(true);
      expect(user.status).toBe('inactive');
      expect(user.approvalStatus).toBe('pending');

      // Cleanup
      await db.delete(authTokens).where(eq(authTokens.staffId, testId));
      await db.delete(staff).where(eq(staff.id, testId));
    });

    it('should reject invalid token', async () => {
      const res = await app.request('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid' }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ===================
  // Resend Verification
  // ===================

  describe('POST /api/v1/auth/resend-verification', () => {
    it('should require authentication', async () => {
      const res = await app.request('/api/v1/auth/resend-verification', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });

    it('should reject if already verified', async () => {
      // Admin user is verified by default
      const res = await app.request('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
    });

    it('should resend verification for unverified user', async () => {
      // Set grace period so unverified user can login
      await authSettingsService.update({ emailVerification: 'grace' });

      // Create unverified user
      const testId = 'staff-resend-test';
      const passwordHash = await authService.hashPassword('test12345');
      await db.delete(staff).where(eq(staff.id, testId));
      await db.insert(staff).values({
        id: testId,
        email: 'resend-test@test.com',
        name: 'Resend Test',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'active', // grace period user
        passwordHash,
        emailVerified: false,
        approvalStatus: 'approved',
      });

      // Login to get token
      const loginRes = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'resend-test@test.com', password: 'test12345' }),
      });
      const { accessToken } = await loginRes.json();

      // Resend verification
      const res = await app.request('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify a new token was created
      const tokens = await db
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.staffId, testId), eq(authTokens.type, 'email_verification')));
      expect(tokens.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      await db.delete(authTokens).where(eq(authTokens.staffId, testId));
      await db.delete(staff).where(eq(staff.id, testId));
    });
  });
});
