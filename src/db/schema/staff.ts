import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Support staff. `role` gates access (admin = everything; agent = Inbox +
 * Knowledge only). `status` tracks the lifecycle: `invited` (created by an
 * admin, no password yet — `passwordHash` is null until they accept via
 * `inviteToken`), `active`, or `disabled` (kept for history, can't log in).
 */
export const staff = sqliteTable('staff', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  // Null while a row is `invited` — set when the invite is accepted.
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'agent'] })
    .notNull()
    .default('agent'),
  status: text('status', { enum: ['invited', 'active', 'disabled'] })
    .notNull()
    .default('active'),
  inviteToken: text('invite_token'),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  // Best-effort presence: refreshed while a dashboard socket is open (login
  // touches it once; `lastLoginAt` only marks session start). Use a recency
  // window (e.g. last 5 min) to derive "active agents".
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
