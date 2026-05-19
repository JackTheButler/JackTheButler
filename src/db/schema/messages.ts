import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { conversations } from './conversations.js';
import { staff } from './staff.js';

/** A single message in a conversation. `ai` author is reserved for Stage 6. */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    author: text('author', { enum: ['customer', 'agent', 'ai'] }).notNull(),
    senderAgentId: text('sender_agent_id').references(() => staff.id),
    content: text('content').notNull(),
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
