/**
 * Authentication Routes Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, roles } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { PERMISSIONS } from '@/core/permissions/index.js';
import { authService } from '@/services/auth.js';

describe('Auth Routes', () => {
  const testUserId = 'staff-test-auth-001';
  const testEmail = 'test-auth@hotel.com';

  // Ensure test user exists
  beforeAll(async () => {
    // Clean up any existing test user
    await db.delete(staff).where(eq(staff.id, testUserId));

    // Create test user with admin role
    const passwordHash = await authService.hashPassword('test123');
    await db.insert(staff).values({
      id: testUserId,
      email: testEmail,
      name: 'Test User',
      roleId: SYSTEM_ROLE_IDS.ADMIN,
      permissions: JSON.stringify([]),
      status: 'active',
      passwordHash,
    });
  });

  afterAll(async () => {
    // Clean up test user
    await db.delete(staff).where(eq(staff.id, testUserId));
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return tokens for valid credentials', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'test123',
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.accessToken).toBeDefined();
      expect(json.refreshToken).toBeDefined();
      expect(json.expiresIn).toBe(900); // 15 minutes
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'wrongpassword',
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for non-existent user', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@hotel.com',
          password: 'password',
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for invalid body', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'not-an-email',
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user info with valid token', async () => {
      // First login to get token
      const loginRes = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'test123',
        }),
      });
      const { accessToken } = await loginRes.json();

      // Then get user info
      const res = await app.request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user.email).toBe(testEmail);
      expect(json.user.roleId).toBe(SYSTEM_ROLE_IDS.ADMIN);
      expect(json.user.roleName).toBe('Admin');
      expect(json.user.permissions).toContain('*');
    });

    it('should return 401 without token', async () => {
      const res = await app.request('/api/v1/auth/me');
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.request('/api/v1/auth/me', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should return new tokens with valid refresh token', async () => {
      // First login to get tokens
      const loginRes = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'test123',
        }),
      });
      const { refreshToken } = await loginRes.json();

      // Then refresh
      const res = await app.request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.accessToken).toBeDefined();
      expect(json.refreshToken).toBeDefined();
    });

    it('should return 401 with invalid refresh token', async () => {
      const res = await app.request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'invalid-token' }),
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Token includes permissions', () => {
    it('should include permissions array in access token payload', async () => {
      const loginRes = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'test123',
        }),
      });
      const { accessToken } = await loginRes.json();

      // Decode JWT payload (without verification)
      const payloadBase64 = accessToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());

      expect(payload.permissions).toBeDefined();
      expect(Array.isArray(payload.permissions)).toBe(true);
      expect(payload.permissions).toContain('*'); // Admin has wildcard
      expect(payload.roleId).toBe(SYSTEM_ROLE_IDS.ADMIN);
    });
  });
});
