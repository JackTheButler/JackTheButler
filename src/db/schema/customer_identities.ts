import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { customers } from './customers.js';

/**
 * How a channel points at a customer. Populated only for *identified*
 * customers (strong channel id, or later a verified email/phone) — anonymous
 * webchat visitors get no customer and no identity. One customer → many
 * identities. The unique key is the hot-path reverse lookup and the
 * future merge-collision detector. `kind`/`verified` are deferred.
 */
export const customerIdentities = sqliteTable(
  'customer_identities',
  {
    id: text('id').primaryKey(),
    channel: text('channel').notNull(),
    externalId: text('external_id').notNull(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    channelExternalUnique: uniqueIndex('customer_identities_channel_external_unique').on(
      t.channel,
      t.externalId,
    ),
    customerIdx: index('customer_identities_customer_id_idx').on(t.customerId),
  }),
);

export type CustomerIdentity = typeof customerIdentities.$inferSelect;
export type NewCustomerIdentity = typeof customerIdentities.$inferInsert;
