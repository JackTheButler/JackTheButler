import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { KnowledgeEntry } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import {
  knowledgeEntries,
  type KnowledgeEntryRow,
} from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { logger as appLogger } from '@/core/logger.js';
import { startJob, activeJobOfType, type Job } from '@/core/jobs.js';
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

  // Re-embed when the question changed (the retrieval key moved) OR when the
  // entry currently has no embedding (e.g. it was created before an
  // embedding app was connected — a manual edit should backfill it).
  const needsEmbed = existing.question !== input.question || existing.embedding === null;
  const embedding = needsEmbed ? await embedQuestion(input.question) : existing.embedding;

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

const REEMBED_JOB = 'kb-reembed';
const REEMBED_BATCH = 50;

/** How many entries are missing an embedding (i.e. not yet searchable). */
export function countMissingEmbeddings(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(knowledgeEntries)
    .where(isNull(knowledgeEntries.embedding))
    .get();
  return row?.n ?? 0;
}

/**
 * Start (or return the already-running) re-embed job. Embeds every entry
 * with a null embedding in batches, ticking progress per batch. Idempotent
 * + incremental: only touches null-embedding rows, so a crash mid-run just
 * means the next run finishes the rest.
 *
 * Returns the Job snapshot — `{ jobId }` for the client, which then tracks
 * live progress over the realtime socket.
 */
export function startReembedMissing(): Job {
  const running = activeJobOfType(REEMBED_JOB);
  if (running) return running;

  const total = countMissingEmbeddings();

  return startJob(REEMBED_JOB, total, async (ctx) => {
    const instance = getActiveEmbeddingInstance();
    if (!instance) throw new Error('no_active_embedding_app');

    // Snapshot the pending ids once, then iterate a fixed list in batches.
    // (Re-querying "where null" each loop would spin forever on any row
    // that fails to embed.) A row that fails stays null and is picked up
    // by the next run; we still tick it so the bar completes honestly —
    // the banner re-derives the missing count afterwards.
    const pending = db
      .select({ id: knowledgeEntries.id, question: knowledgeEntries.question })
      .from(knowledgeEntries)
      .where(isNull(knowledgeEntries.embedding))
      .all();

    for (let i = 0; i < pending.length; i += REEMBED_BATCH) {
      if (ctx.cancelled) return;
      const batch = pending.slice(i, i + REEMBED_BATCH);
      const { vectors } = await instance.embed({ texts: batch.map((b) => b.question) });
      const now = new Date();
      for (let j = 0; j < batch.length; j++) {
        const vector = vectors[j];
        if (!vector || vector.length === 0) continue;
        db.update(knowledgeEntries)
          .set({ embedding: encodeEmbedding(vector), updatedAt: now })
          .where(eq(knowledgeEntries.id, batch[j].id))
          .run();
      }
      ctx.tick(batch.length);
    }
  });
}
