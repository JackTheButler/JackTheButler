import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { conversations } from './conversations.js';
import { staff } from './staff.js';

/**
 * A single entry in a conversation. `author='ai'` is reserved for Stage 6.
 * `author='system'` + non-null `event` = a lifecycle marker (e.g. reopened),
 * not a chat message: rendered as a divider, hidden from the customer, used
 * by the pipeline as a segment boundary.
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    author: text('author', { enum: ['customer', 'agent', 'ai', 'system'] }).notNull(),
    senderAgentId: text('sender_agent_id').references(() => staff.id),
    content: text('content').notNull(),
    /** Set on lifecycle markers (e.g. 'reopened'); null for real messages. */
    event: text('event'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    conversationIdx: index('messages_conversation_id_created_at_idx').on(
      t.conversationId,
      t.createdAt,
    ),
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
