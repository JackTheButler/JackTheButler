import { eq } from 'drizzle-orm';
import { db } from '@/db/client.js';
import { settings } from '@/db/schema/index.js';

/**
 * Generic key-value settings store. Values are JSON-encoded so any small
 * scalar/object round-trips through one column; the caller knows each key's
 * type. Domain modules wrap these with typed, validated accessors (e.g.
 * knowledge/service `getMatchStrictness`) — features never touch raw keys.
 */

/** Pure read. Returns the parsed value, or `undefined` when the key is absent. */
export function readSetting<T>(key: string): T | undefined {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return undefined;
  }
}

/** Read with a fallback (does NOT persist the fallback). */
export function getSetting<T>(key: string, fallback: T): T {
  const value = readSetting<T>(key);
  return value === undefined ? fallback : value;
}

/** Upsert a setting. */
export function writeSetting(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  db.insert(settings)
    .values({ key, value: json, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: json, updatedAt: new Date() },
    })
    .run();
}
