import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { staff } from './staff.js';

/**
 * A browser/device Web Push subscription, owned by a staff member. One row per
 * endpoint (a device can re-subscribe; we upsert by endpoint). Deleted when the
 * staff row is removed, or pruned when the push service reports it dead
 * (404/410). `p256dh` + `auth` are the client keys used to encrypt payloads.
 */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    staffId: text('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    staffIdx: index('push_subscriptions_staff_idx').on(t.staffId),
  }),
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
