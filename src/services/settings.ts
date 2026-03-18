/**
 * Settings Service
 *
 * Generic key-value store for application settings.
 * All values are serialized as JSON (strings stored as-is for backwards compatibility).
 *
 * @module services/settings
 */

import { eq } from 'drizzle-orm';
import { db, settings } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';
import { now } from '@/utils/time.js';

const log = createLogger('settings');

export class SettingsService {
  /**
   * Get a setting by key, returning defaultValue if not found or unparseable.
   * Strings stored as raw text are returned as-is.
   */
  async get<T>(key: string, defaultValue: T): Promise<T> {
    const row = await db.select().from(settings).where(eq(settings.key, key)).get();
    if (!row) return defaultValue;

    try {
      return JSON.parse(row.value) as T;
    } catch {
      // Stored as raw string (e.g. property_language = 'en')
      return row.value as unknown as T;
    }
  }

  /**
   * Delete a setting by key.
   */
  async delete(key: string): Promise<void> {
    await db.delete(settings).where(eq(settings.key, key)).run();
    log.debug({ key }, 'Setting deleted');
  }

  /**
   * Set a setting by key. Objects are JSON-serialized; strings are stored as-is.
   */
  async set<T>(key: string, value: T): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    await db
      .insert(settings)
      .values({ key, value: serialized })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: serialized, updatedAt: now() },
      })
      .run();

    log.debug({ key }, 'Setting updated');
  }
}

export const settingsService = new SettingsService();
