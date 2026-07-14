import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * The person being supported. Stable identity that AI memory, history, and
 * RAG context key off long-term. Cross-channel identity resolution is
 * deferred — Stage 2 just needs the stable home.
 */
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  name: text('name'),
  contact: text('contact'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
