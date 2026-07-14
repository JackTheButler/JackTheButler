import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Generic key-value store for small, scattered operational settings —
 * the long tail of knobs/flags that don't each warrant their own table
 * (e.g. `kb.matchStrictness`, future `kb.topK`, feature toggles). Rich,
 * multi-field config with its own UI keeps a dedicated typed table
 * (assistant_profile, business_profile); this is for the rest.
 *
 * `value` is JSON-encoded so one column holds strings, numbers, booleans,
 * or small objects uniformly; the consuming module knows each key's type
 * (validates with zod). Absent key ⇒ caller's fallback, so fresh installs
 * need no seeding.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(), // dot-namespaced, e.g. 'kb.matchStrictness'
  value: text('value').notNull(), // JSON-encoded
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type SettingRow = typeof settings.$inferSelect;
