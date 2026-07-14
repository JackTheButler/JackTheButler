import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Per-app configuration. One row per registered app (PK = manifest id).
 * `config` is an AES-256-GCM encrypted JSON blob. Status is derived at read
 * time (enabled + config presence + validation + lastError), never stored.
 * `lastError` carries the most recent integration call's failure message
 * (cleared on the next success). Drives the runtime-error UI signal.
 */
export const appConfigs = sqliteTable('app_configs', {
  appId: text('app_id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  config: text('config'),
  lastError: text('last_error'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type AppConfigRow = typeof appConfigs.$inferSelect;
export type NewAppConfigRow = typeof appConfigs.$inferInsert;
