/**
 * Auth Token Service Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db, staff, authTokens } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { AuthTokenService } from '@/services/auth-token.js';
import { authService } from '@/services/auth.js';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';

describe('AuthTokenService', () => {
  const service = new AuthTokenService();
  const testStaffId = 'staff-token-test';

  beforeAll(async () => {
    // Clean up and create test user
    await db.delete(authTokens).where(eq(authTokens.staffId, testStaffId));
    await db.delete(staff).where(eq(staff.id, testStaffId));

    const passwordHash = await authService.hashPassword('test12345');
    await db.insert(staff).values({
      id: testStaffId,
      email: 'token-test@test.com',
      name: 'Token Test User',
      roleId: SYSTEM_ROLE_IDS.STAFF,
      status: 'active',
      passwordHash,
    });
  });

  afterAll(async () => {
    await db.delete(authTokens).where(eq(authTokens.staffId, testStaffId));
    await db.delete(staff).where(eq(staff.id, testStaffId));
  });

  beforeEach(async () => {
    // Clean tokens between tests
    await db.delete(authTokens).where(eq(authTokens.staffId, testStaffId));
  });

  describe('createToken', () => {
    it('should create a token and store it in DB', async () => {
      const token = await service.createToken(testStaffId, 'password_reset');

      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes hex

      // Verify stored in DB
      const row = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, token))
        .get();

      expect(row).toBeDefined();
      expect(row?.staffId).toBe(testStaffId);
      expect(row?.type).toBe('password_reset');
      expect(row?.usedAt).toBeNull();
    });

    it('should create token with correct expiry for password_reset (1 hour)', async () => {
      const before = Date.now();
      const token = await service.createToken(testStaffId, 'password_reset');

      const row = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, token))
        .get();

      const expiresAt = new Date(row!.expiresAt).getTime();
      const oneHour = 60 * 60 * 1000;

      // Should expire roughly 1 hour from now (within 5 seconds tolerance)
      expect(expiresAt).toBeGreaterThanOrEqual(before + oneHour - 5000);
      expect(expiresAt).toBeLessThanOrEqual(before + oneHour + 5000);
    });

    it('should create token with correct expiry for email_verification (7 days)', async () => {
      const before = Date.now();
      const token = await service.createToken(testStaffId, 'email_verification');

      const row = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, token))
        .get();

      const expiresAt = new Date(row!.expiresAt).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDays - 5000);
      expect(expiresAt).toBeLessThanOrEqual(before + sevenDays + 5000);
    });
  });

  describe('validateToken', () => {
    it('should validate a correct token and type', async () => {
      const token = await service.createToken(testStaffId, 'password_reset');

      const result = await service.validateToken(token, 'password_reset');

      expect(result.staffId).toBe(testStaffId);
      expect(result.tokenId).toBeDefined();
    });

    it('should reject non-existent token', async () => {
      await expect(
        service.validateToken('nonexistent', 'password_reset')
      ).rejects.toThrow('Invalid or expired token');
    });

    it('should reject wrong type', async () => {
      const token = await service.createToken(testStaffId, 'password_reset');

      await expect(
        service.validateToken(token, 'email_verification')
      ).rejects.toThrow('Invalid or expired token');
    });

    it('should reject already-used token', async () => {
      const token = await service.createToken(testStaffId, 'password_reset');
      const { tokenId } = await service.validateToken(token, 'password_reset');
      await service.markUsed(tokenId);

      await expect(
        service.validateToken(token, 'password_reset')
      ).rejects.toThrow('Token has already been used');
    });

    it('should reject expired token', async () => {
      const token = await service.createToken(testStaffId, 'password_reset');

      // Manually set expiresAt to the past
      await db
        .update(authTokens)
        .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(authTokens.token, token))
        .run();

      await expect(
        service.validateToken(token, 'password_reset')
      ).rejects.toThrow('Token has expired');
    });
  });

  describe('markUsed', () => {
    it('should set usedAt timestamp', async () => {
      const token = await service.createToken(testStaffId, 'password_reset');
      const { tokenId } = await service.validateToken(token, 'password_reset');

      await service.markUsed(tokenId);

      const row = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.id, tokenId))
        .get();

      expect(row?.usedAt).toBeDefined();
      expect(row?.usedAt).not.toBeNull();
    });
  });

  describe('deleteExpiredTokens', () => {
    it('should remove only expired tokens', async () => {
      // Create a valid token
      const validToken = await service.createToken(testStaffId, 'password_reset');

      // Create an expired token by manually setting expiresAt
      const expiredToken = await service.createToken(testStaffId, 'email_verification');
      await db
        .update(authTokens)
        .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(authTokens.token, expiredToken))
        .run();

      const deleted = await service.deleteExpiredTokens();

      expect(deleted).toBe(1);

      // Valid token should still exist
      const validRow = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, validToken))
        .get();
      expect(validRow).toBeDefined();
    });
  });

  describe('invalidateTokens', () => {
    it('should mark all unused tokens of a type as used', async () => {
      // Create multiple tokens
      const token1 = await service.createToken(testStaffId, 'password_reset');
      const token2 = await service.createToken(testStaffId, 'password_reset');
      const emailToken = await service.createToken(testStaffId, 'email_verification');

      await service.invalidateTokens(testStaffId, 'password_reset');

      // password_reset tokens should be used
      const row1 = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, token1))
        .get();
      expect(row1?.usedAt).not.toBeNull();

      const row2 = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, token2))
        .get();
      expect(row2?.usedAt).not.toBeNull();

      // email_verification token should NOT be affected
      const emailRow = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, emailToken))
        .get();
      expect(emailRow?.usedAt).toBeNull();
    });
  });
});
