/**
 * Auth Settings Service
 *
 * Manages authentication settings stored in the settings table.
 * Follows the same key-value pattern as hotel_profile.
 *
 * @module services/auth-settings
 */

import { eq } from 'drizzle-orm';
import { db, settings, roles } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';
import { ValidationError } from '@/errors/index.js';

const log = createLogger('auth-settings');

const SETTINGS_KEY = 'auth_settings';

// ===================
// Types
// ===================

export interface AuthSettings {
  registrationEnabled: boolean;
  emailVerification: 'instant' | 'grace';
  emailVerificationGraceDays: number;
  defaultRoleId: string | null;
  requireAdminApproval: boolean;
}

const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  registrationEnabled: false,
  emailVerification: 'instant',
  emailVerificationGraceDays: 7,
  defaultRoleId: null,
  requireAdminApproval: false,
};

// ===================
// Service
// ===================

export class AuthSettingsService {
  /**
   * Get current auth settings with defaults
   * When defaultRoleId is null, resolves to the Staff role by name
   */
  async get(): Promise<AuthSettings> {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEY))
      .get();

    let stored: Partial<AuthSettings> = {};
    if (row) {
      try {
        stored = JSON.parse(row.value) as Partial<AuthSettings>;
      } catch {
        log.warn('Failed to parse auth settings, returning defaults');
      }
    }

    const merged: AuthSettings = { ...DEFAULT_AUTH_SETTINGS, ...stored };

    // Resolve defaultRoleId to Staff role if null
    if (merged.defaultRoleId === null) {
      const staffRole = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'Staff'))
        .get();

      if (staffRole) {
        merged.defaultRoleId = staffRole.id;
      }
    }

    return merged;
  }

  /**
   * Update auth settings (partial update)
   */
  async update(input: Partial<AuthSettings>): Promise<AuthSettings> {
    // Validate emailVerification value
    if (
      input.emailVerification !== undefined &&
      !['instant', 'grace'].includes(input.emailVerification)
    ) {
      throw new ValidationError('emailVerification must be "instant" or "grace"');
    }

    // Validate emailVerificationGraceDays
    if (
      input.emailVerificationGraceDays !== undefined &&
      (input.emailVerificationGraceDays < 1 || input.emailVerificationGraceDays > 365)
    ) {
      throw new ValidationError('emailVerificationGraceDays must be between 1 and 365');
    }

    // Validate defaultRoleId references an existing role
    if (input.defaultRoleId !== undefined && input.defaultRoleId !== null) {
      const role = await db
        .select()
        .from(roles)
        .where(eq(roles.id, input.defaultRoleId))
        .get();

      if (!role) {
        throw new ValidationError('Invalid defaultRoleId: role not found');
      }
    }

    // Get current settings and merge
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEY))
      .get();

    let current: Partial<AuthSettings> = {};
    if (row) {
      try {
        current = JSON.parse(row.value) as Partial<AuthSettings>;
      } catch {
        // Start fresh if corrupt
      }
    }

    const merged = { ...current, ...input };
    const now = new Date().toISOString();

    if (row) {
      await db
        .update(settings)
        .set({ value: JSON.stringify(merged), updatedAt: now })
        .where(eq(settings.key, SETTINGS_KEY))
        .run();
    } else {
      await db
        .insert(settings)
        .values({ key: SETTINGS_KEY, value: JSON.stringify(merged), updatedAt: now })
        .run();
    }

    log.info({ changes: Object.keys(input) }, 'Auth settings updated');

    return this.get();
  }
}

export const authSettingsService = new AuthSettingsService();
