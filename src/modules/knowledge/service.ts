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
import { readSetting, writeSetting } from '@/core/settings.js';
import { getActiveEmbeddingInstance } from '@/modules/apps/service.js';

/* ── Retrieval match strictness ────────────────────────────────── */

export const MATCH_STRICTNESS_LEVELS = ['loose', 'balanced', 'strict'] as const;
export type MatchStrictness = (typeof MATCH_STRICTNESS_LEVELS)[number];

const STRICTNESS_KEY = 'kb.matchStrictness';
const DEFAULT_STRICTNESS: MatchStrictness = 'balanced';

/** Qualitative level → cosine floor. Calibrated to text-embedding-3; tune
 *  the floors here without touching stored values (we persist the level,
 *  not the number). */
const STRICTNESS_FLOOR: Record<MatchStrictness, number> = {
  loose: 0.3,
  balanced: 0.4,
  strict: 0.5,
};

/** Current strictness level. Lazy-seeds `'balanced'` on first read (same
 *  pattern as the business default language) so it's an explicit row. */
export function getMatchStrictness(): MatchStrictness {
  const stored = readSetting<string>(STRICTNESS_KEY);
  if (stored && (MATCH_STRICTNESS_LEVELS as readonly string[]).includes(stored)) {
    return stored as MatchStrictness;
  }
  writeSetting(STRICTNESS_KEY, DEFAULT_STRICTNESS);
  return DEFAULT_STRICTNESS;
}

export function setMatchStrictness(level: MatchStrictness): void {
  writeSetting(STRICTNESS_KEY, level);
}

/** The cosine floor the retriever should use, derived from the level. */
export function getKbMinSimilarity(): number {
  return STRICTNESS_FLOOR[getMatchStrictness()];
}

/* ── Retrieval top-K ───────────────────────────────────────────── */

/** How many top-scoring entries the retriever feeds the AI. Below 3 risks
 *  dropping a relevant entry on a multi-part question; above ~10 is mostly
 *  low-similarity noise + wasted tokens. */
export const TOP_K_OPTIONS = [3, 5, 8, 10] as const;
export type TopK = (typeof TOP_K_OPTIONS)[number];

const TOP_K_KEY = 'kb.topK';
const DEFAULT_TOP_K: TopK = 5;

/** Current top-K. Lazy-seeds the default on first read (same pattern as
 *  match strictness) so it's an explicit, editable row. */
export function getKbTopK(): TopK {
  const stored = readSetting<number>(TOP_K_KEY);
  if (typeof stored === 'number' && (TOP_K_OPTIONS as readonly number[]).includes(stored)) {
    return stored as TopK;
  }
  writeSetting(TOP_K_KEY, DEFAULT_TOP_K);
  return DEFAULT_TOP_K;
}

export function setKbTopK(k: TopK): void {
  writeSetting(TOP_K_KEY, k);
}

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

/** Text we embed for retrieval. We combine the question AND the answer (not
 *  the question alone) so the entry's vector carries the answer's content
 *  words too — that broadens recall against differently-phrased customer
 *  questions (e.g. "when do I get my money back?" matching a "refund speed"
 *  entry). The query side still embeds just the customer's question. */
function embedText(question: string, answer: string): string {
  return `${question}\n\n${answer}`;
}

async function embedEntry(question: string, answer: string): Promise<Buffer | null> {
  const instance = getActiveEmbeddingInstance();
  if (!instance) return null;
  try {
    const result = await instance.embed({ texts: [embedText(question, answer)] });
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
  const embedding = await embedEntry(input.question, input.answer);

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

  // Re-embed when the question OR answer changed (both feed the vector now)
  // OR when the entry has no embedding yet (created before an embedding app
  // was connected — a manual edit should backfill it).
  const needsEmbed =
    existing.question !== input.question ||
    existing.answer !== input.answer ||
    existing.embedding === null;
  const embedding = needsEmbed
    ? await embedEntry(input.question, input.answer)
    : existing.embedding;

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

/** Counts driving the KB banner / re-embed actions. `missing` = not yet
 *  searchable; `total` = approved entries (the re-embed-all target). */
export function embeddingCounts(): { missing: number; total: number } {
  const missing = db
    .select({ n: sql<number>`count(*)` })
    .from(knowledgeEntries)
    .where(isNull(knowledgeEntries.embedding))
    .get();
  const total = db
    .select({ n: sql<number>`count(*)` })
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.status, 'approved'))
    .get();
  return { missing: missing?.n ?? 0, total: total?.n ?? 0 };
}

export type ReembedScope = 'missing' | 'all';

/**
 * Start (or return the already-running) re-embed job.
 *  - `'missing'` (default): only entries with a null embedding — backfill
 *    after connecting an embedding provider. Cheap, incremental.
 *  - `'all'`: every approved entry — use after changing the embedding model
 *    (vector space changed) or what we embed (e.g. question-only → Q+A).
 *
 * Embeds in batches of the combined question+answer text, ticking progress
 * per batch. Idempotent + incremental: snapshots ids once; a failed row is
 * left as-is and picked up next run; a crash mid-run is recovered by
 * re-running.
 */
export function startReembed(scope: ReembedScope = 'missing'): Job {
  const running = activeJobOfType(REEMBED_JOB);
  if (running) return running;

  const baseFilter =
    scope === 'all'
      ? eq(knowledgeEntries.status, 'approved')
      : isNull(knowledgeEntries.embedding);

  // Snapshot ids + text once, then iterate a fixed list in batches.
  const pending = db
    .select({
      id: knowledgeEntries.id,
      question: knowledgeEntries.question,
      answer: knowledgeEntries.answer,
    })
    .from(knowledgeEntries)
    .where(baseFilter)
    .all();

  return startJob(REEMBED_JOB, pending.length, async (ctx) => {
    const instance = getActiveEmbeddingInstance();
    if (!instance) throw new Error('no_active_embedding_app');

    for (let i = 0; i < pending.length; i += REEMBED_BATCH) {
      if (ctx.cancelled) return;
      const batch = pending.slice(i, i + REEMBED_BATCH);
      const { vectors } = await instance.embed({
        texts: batch.map((b) => embedText(b.question, b.answer)),
      });
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
