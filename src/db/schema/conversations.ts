import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { customers } from './customers.js';
import { staff } from './staff.js';

/**
 * A support thread. `mode` is the human-takeover flag designed in from the
 * start: `ai` (the pipeline may answer — Stage 6) vs `human` (an agent has
 * taken over; AI pauses). No automated transitions exist in Stage 2.
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    ref: integer('ref').notNull().unique(),
    channel: text('channel').notNull().default('webchat'),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    mode: text('mode', { enum: ['ai', 'human'] })
      .notNull()
      .default('ai'),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    assignedAgentId: text('assigned_agent_id').references(() => staff.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    lastMessageAtIdx: index('conversations_last_message_at_idx').on(t.lastMessageAt),
    statusIdx: index('conversations_status_idx').on(t.status),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
