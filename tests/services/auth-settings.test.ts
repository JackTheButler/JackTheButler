/**
 * Auth Settings Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { db, settings, roles } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { AuthSettingsService } from '@/services/auth-settings.js';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';

describe('AuthSettingsService', () => {
  const service = new AuthSettingsService();

  beforeEach(async () => {
    // Clean up auth_settings between tests
    await db.delete(settings).where(eq(settings.key, 'auth_settings'));
  });

  describe('get', () => {
    it('should return defaults when no settings stored', async () => {
      const result = await service.get();

      expect(result.registrationEnabled).toBe(false);
      expect(result.emailVerification).toBe('instant');
      expect(result.emailVerificationGraceDays).toBe(7);
      expect(result.requireAdminApproval).toBe(false);
    });

    it('should resolve defaultRoleId to Staff role when null', async () => {
      const result = await service.get();

      // Should resolve to the Staff role
      expect(result.defaultRoleId).toBe(SYSTEM_ROLE_IDS.STAFF);
    });

    it('should return stored settings merged with defaults', async () => {
      // Store partial settings
      await db.insert(settings).values({
        key: 'auth_settings',
        value: JSON.stringify({ registrationEnabled: true }),
      });

      const result = await service.get();

      expect(result.registrationEnabled).toBe(true);
      // Other fields should be defaults
      expect(result.emailVerification).toBe('instant');
      expect(result.requireAdminApproval).toBe(false);
    });
  });

  describe('update', () => {
    it('should persist and read back partial updates', async () => {
      await service.update({ registrationEnabled: true });

      const result = await service.get();
      expect(result.registrationEnabled).toBe(true);
      expect(result.emailVerification).toBe('instant'); // default preserved
    });

    it('should merge multiple partial updates', async () => {
      await service.update({ registrationEnabled: true });
      await service.update({ emailVerification: 'grace', emailVerificationGraceDays: 14 });

      const result = await service.get();
      expect(result.registrationEnabled).toBe(true);
      expect(result.emailVerification).toBe('grace');
      expect(result.emailVerificationGraceDays).toBe(14);
    });

    it('should accept a valid defaultRoleId', async () => {
      const result = await service.update({ defaultRoleId: SYSTEM_ROLE_IDS.VIEWER });

      expect(result.defaultRoleId).toBe(SYSTEM_ROLE_IDS.VIEWER);
    });

    it('should reject invalid defaultRoleId', async () => {
      await expect(
        service.update({ defaultRoleId: 'nonexistent-role' })
      ).rejects.toThrow('Invalid defaultRoleId');
    });

    it('should reject invalid emailVerification value', async () => {
      await expect(
        service.update({ emailVerification: 'invalid' as 'instant' })
      ).rejects.toThrow('emailVerification must be');
    });

    it('should reject emailVerificationGraceDays out of range', async () => {
      await expect(
        service.update({ emailVerificationGraceDays: 0 })
      ).rejects.toThrow('emailVerificationGraceDays must be');

      await expect(
        service.update({ emailVerificationGraceDays: 400 })
      ).rejects.toThrow('emailVerificationGraceDays must be');
    });

    it('should allow setting defaultRoleId to null', async () => {
      // First set it to something
      await service.update({ defaultRoleId: SYSTEM_ROLE_IDS.VIEWER });

      // Then set back to null (runtime resolution)
      const result = await service.update({ defaultRoleId: null });

      // get() resolves null to Staff role
      expect(result.defaultRoleId).toBe(SYSTEM_ROLE_IDS.STAFF);
    });
  });
});
