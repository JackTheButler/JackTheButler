import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core';

/**
 * Knowledge base — flat list of Q&A entries.
 *
 * One table, one row per Q&A pair. The retriever embeds `question` and
 * cosine-matches against stored `embedding`s; on a hit, `answer` is what
 * the AI reads in its prompt. `topic` is an optional grouping label set
 * by the operator (e.g. "Shipping", "Refunds"); `status` distinguishes
 * `draft` (AI-extracted, pending review) from `approved` (eligible for
 * retrieval). Manually-entered rows are `approved` immediately.
 *
 * `embedding` is nullable so an entry can be saved before an embedding
 * provider is configured — retrieval simply skips null-embedding rows.
 */
export const knowledgeEntries = sqliteTable(
  'knowledge_entries',
  {
    id: text('id').primaryKey(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    embedding: blob('embedding'),
    topic: text('topic'),
    status: text('status', { enum: ['draft', 'approved'] })
      .notNull()
      .default('approved'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    topicStatusIdx: index('knowledge_entries_topic_status_idx').on(t.topic, t.status),
  }),
);

export type KnowledgeEntryRow = typeof knowledgeEntries.$inferSelect;
export type NewKnowledgeEntryRow = typeof knowledgeEntries.$inferInsert;
