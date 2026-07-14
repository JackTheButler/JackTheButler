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
    /** BCP-47 code of `content`. Populated by the pipeline's detect stage
     *  for inbound and set to the business default for outbound. Null on
     *  pre-translation-era rows + lifecycle markers. */
    language: text('language'),
    /** `content` rendered into the business default language. For inbound:
     *  produced by translateInbound; null when language matches default
     *  (nothing to translate). For outbound: null (content is already in
     *  default lang); the customer-language version lives here only when
     *  outbound translation ran — see translateOutbound. */
    translation: text('translation'),
    /** Set on lifecycle markers (e.g. 'reopened'); null for real messages. */
    event: text('event'),
    /** Retrieval transparency: JSON snapshot of the knowledge entries the AI
     *  used to compose this reply, captured at generation time so it survives
     *  later edits/deletes of the entry. Shape: KnowledgeHitDTO[]
     *  ({ id, question, answer, topic, similarity }). Only set on `ai` rows
     *  that retrieved entries; null otherwise. Dashboard-only (never exposed to
     *  the public widget history). */
    knowledgeHits: text('knowledge_hits'),
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
