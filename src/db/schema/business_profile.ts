import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Single-row business profile (single-tenant deployment). Distinct from
 * `assistant_profile` — that row describes the AI's voice; this describes
 * the business itself. Drives the dashboard's default reading language
 * and, later (Phase 2), the system language the AI pipeline reasons in
 * and translates inbound questions into.
 *
 * Future fields (support email, timezone, support hours, etc.) join this
 * row when they're scoped; deliberately omitted now to keep Phase 1
 * focused on the language seam.
 */
export const businessProfile = sqliteTable('business_profile', {
  id: text('id').primaryKey(), // always 'default'
  // Name + email start empty on first read — they're real identifiers
  // the operator fills in. Only `defaultLanguage` carries a seed
  // ('en') because the AI pipeline (Phase 2) needs SOMETHING to read
  // before the operator visits Settings.
  name: text('name').notNull(),
  supportEmail: text('support_email'),
  defaultLanguage: text('default_language').notNull(), // BCP-47, e.g. 'en', 'fa'
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type BusinessProfileRow = typeof businessProfile.$inferSelect;
export type NewBusinessProfileRow = typeof businessProfile.$inferInsert;
