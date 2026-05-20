import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Knowledge base — top-level documents. One row per pasted / uploaded
 * source. Chunks live in `kb_chunks` with an FK back here so a
 * delete-document cascades to delete its chunks.
 *
 * `source` is free-form for now ('manual', 'url', 'upload', …). When a
 * real ingest pipeline lands we can constrain via an enum.
 */
export const kbDocuments = sqliteTable('kb_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  source: text('source').notNull().default('manual'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type KbDocument = typeof kbDocuments.$inferSelect;
export type NewKbDocument = typeof kbDocuments.$inferInsert;
