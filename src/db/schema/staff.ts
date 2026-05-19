import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** Support agents. Stage 1: identity only — roles/permissions are Stage 8. */
export const staff = sqliteTable('staff', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
