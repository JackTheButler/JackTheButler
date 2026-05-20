import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core';
import { kbDocuments } from './kb_documents.js';

/**
 * Knowledge base — embedded chunks. Embedding lives as a raw bytes blob
 * (Float32Array serialised) so the in-process cosine scan stays simple;
 * we move to `sqlite-vec` only if the row scan stops being fast enough.
 *
 * `embedding` is nullable so a chunk row can be saved before the embed
 * call completes (or skip when no embedding app is active — chunks
 * persist, retrieval just no-ops). `position` orders chunks within a
 * document.
 */
export const kbChunks = sqliteTable(
  'kb_chunks',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => kbDocuments.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    content: text('content').notNull(),
    embedding: blob('embedding'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    documentIdx: index('kb_chunks_document_id_position_idx').on(t.documentId, t.position),
  }),
);

export type KbChunk = typeof kbChunks.$inferSelect;
export type NewKbChunk = typeof kbChunks.$inferInsert;
