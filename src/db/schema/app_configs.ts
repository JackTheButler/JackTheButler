import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Per-app configuration. One row per registered app (PK = manifest id).
 * `config` is an AES-256-GCM encrypted JSON blob. Status is derived at read
 * time (enabled + config presence + validation), never stored.
 */
export const appConfigs = sqliteTable('app_configs', {
  appId: text('app_id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  config: text('config'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type AppConfigRow = typeof appConfigs.$inferSelect;
export type NewAppConfigRow = typeof appConfigs.$inferInsert;
