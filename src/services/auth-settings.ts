/**
 * Auth Settings Service
 *
 * Manages authentication settings stored in the settings table.
 * Follows the same key-value pattern as hotel_profile.
 *
 * @module services/auth-settings
 */

import { eq } from 'drizzle-orm';
import { db, roles } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';
import { ValidationError } from '@/errors/index.js';
import { settingsService } from './settings.js';

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
    const stored = await settingsService.get<Partial<AuthSettings>>(SETTINGS_KEY, {});
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
    const current = await settingsService.get<Partial<AuthSettings>>(SETTINGS_KEY, {});
    const merged = { ...current, ...input };
    await settingsService.set(SETTINGS_KEY, merged);

    log.info({ changes: Object.keys(input) }, 'Auth settings updated');

    return this.get();
  }
}

export const authSettingsService = new AuthSettingsService();
