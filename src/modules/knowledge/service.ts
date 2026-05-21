import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { KnowledgeEntry } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import {
  knowledgeEntries,
  type KnowledgeEntryRow,
} from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { logger as appLogger } from '@/core/logger.js';
import { getActiveEmbeddingInstance } from '@/modules/apps/service.js';

/**
 * Knowledge base — flat Q&A entries.
 *
 * Embeddings are computed on save when an embedding app is active. If
 * not, the entry persists with `embedding = null` and the dashboard
 * shows a banner; retrieval (Stage 7c) skips null-embedding rows.
 *
 * Storage shape: `embedding` is a Float32Array serialised to bytes —
 * compact (4 bytes/float vs. ~20 bytes/float for JSON) and fast to
 * cosine-scan in JS once decoded.
 */

function encodeEmbedding(vector: readonly number[]): Buffer {
  const arr = new Float32Array(vector);
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function toDTO(row: KnowledgeEntryRow): KnowledgeEntry {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    topic: row.topic,
    status: row.status,
    hasEmbedding: row.embedding !== null && row.embedding !== undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

async function embedQuestion(question: string): Promise<Buffer | null> {
  const instance = getActiveEmbeddingInstance();
  if (!instance) return null;
  try {
    const result = await instance.embed({ texts: [question] });
    const vector = result.vectors[0];
    if (!vector || vector.length === 0) return null;
    return encodeEmbedding(vector);
  } catch (err) {
    appLogger.error({ err }, 'knowledge entry embedding failed');
    return null;
  }
}

export interface ListOpts {
  topic?: string;
  status?: 'draft' | 'approved';
}

export function listEntries(opts: ListOpts = {}): KnowledgeEntry[] {
  const filters = [];
  if (opts.topic) filters.push(eq(knowledgeEntries.topic, opts.topic));
  if (opts.status) filters.push(eq(knowledgeEntries.status, opts.status));
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

  const rows = db
    .select()
    .from(knowledgeEntries)
    .where(where)
    .orderBy(desc(knowledgeEntries.updatedAt))
    .all();
  return rows.map(toDTO);
}

export function getEntry(id: string): KnowledgeEntry {
  const row = db
    .select()
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.id, id))
    .get();
  if (!row) throw new AppError('entry_not_found', 404);
  return toDTO(row);
}

export interface EntryInput {
  question: string;
  answer: string;
  topic: string | null;
}

export async function addEntry(input: EntryInput): Promise<KnowledgeEntry> {
  const now = new Date();
  const id = randomUUID();
  const embedding = await embedQuestion(input.question);

  db.insert(knowledgeEntries)
    .values({
      id,
      question: input.question,
      answer: input.answer,
      topic: input.topic,
      status: 'approved',
      embedding,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getEntry(id);
}

export async function updateEntry(
  id: string,
  input: EntryInput,
): Promise<KnowledgeEntry> {
  const existing = db
    .select()
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.id, id))
    .get();
  if (!existing) throw new AppError('entry_not_found', 404);

  // Re-embed only when the question changed — answer + topic edits don't
  // affect the retrieval key.
  const embedding =
    existing.question === input.question
      ? existing.embedding
      : await embedQuestion(input.question);

  db.update(knowledgeEntries)
    .set({
      question: input.question,
      answer: input.answer,
      topic: input.topic,
      embedding,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeEntries.id, id))
    .run();
  return getEntry(id);
}

export function deleteEntry(id: string): void {
  const existing = db
    .select({ id: knowledgeEntries.id })
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.id, id))
    .get();
  if (!existing) throw new AppError('entry_not_found', 404);
  db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, id)).run();
}
