import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core';

/**
 * Knowledge base — flat list of Q&A entries.
 *
 * One table, one row per Q&A pair. Two vectors per entry, populated together:
 *  - `contentEmbedding` — the question AND answer (`question\n\nanswer`), used
 *    for retrieval. Carrying the answer's words broadens recall against
 *    differently-phrased customer questions.
 *  - `questionEmbedding` — the question alone, used for duplicate detection
 *    (a question-to-question comparison; the answer would only dilute it).
 *
 * On a retrieval hit, `answer` is what the AI reads. `topic` is an optional
 * grouping label (e.g. "Shipping"); `status` distinguishes `draft`
 * (AI-extracted, pending review) from `approved` (eligible for retrieval) —
 * manually-entered rows are `approved` immediately.
 *
 * Both embeddings are nullable so an entry can be saved before an embedding
 * provider is configured (retrieval skips null-`contentEmbedding` rows), and
 * so bulk-imported rows can persist fast and be embedded later by re-embed.
 */
export const knowledgeEntries = sqliteTable(
  'knowledge_entries',
  {
    id: text('id').primaryKey(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    contentEmbedding: blob('content_embedding'),
    questionEmbedding: blob('question_embedding'),
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
