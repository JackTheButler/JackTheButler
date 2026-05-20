import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Single-row assistant persona (single-business deployment). Drives the
 * system prompt the AI pipeline builds. Distinct from a future
 * `business_profile` — that row describes the business; this describes the
 * AI's voice and guardrails.
 */
export const assistantProfile = sqliteTable('assistant_profile', {
  id: text('id').primaryKey(), // always 'default'
  name: text('name').notNull(),
  tone: text('tone').notNull(),
  instructions: text('instructions').notNull().default(''),
  fallback: text('fallback').notNull(),
  topicsToAvoid: text('topics_to_avoid').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type AssistantProfileRow = typeof assistantProfile.$inferSelect;
export type NewAssistantProfileRow = typeof assistantProfile.$inferInsert;
