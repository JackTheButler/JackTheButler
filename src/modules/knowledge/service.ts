import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { KnowledgeEntry } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import { knowledgeEntries, type KnowledgeEntryRow } from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { logger as appLogger } from '@/core/logger.js';
import { startJob, activeJobOfType, type Job } from '@/core/jobs.js';
import { readSetting, writeSetting } from '@/core/settings.js';
import { getActiveEmbeddingInstance } from '@/modules/apps/service.js';
import { findSimilarQuestions } from '@/modules/knowledge/search.js';

/* ── Retrieval match strictness ────────────────────────────────── */

/** Match strictness is a continuous cosine-similarity floor: an entry must
 *  score at or above it to be retrieved. The UI labels sub-ranges Loose /
 *  Balanced / Strict, but we persist the raw number. Bounds keep it in the
 *  band that's actually useful for text-embedding-3 (outside ~[0.2, 0.7] it's
 *  either everything or nothing). */
export const MATCH_THRESHOLD_MIN = 0.2;
export const MATCH_THRESHOLD_MAX = 0.7;
export const MATCH_THRESHOLD_STEP = 0.01;
const DEFAULT_MATCH_THRESHOLD = 0.4; // was the 'balanced' floor

const STRICTNESS_KEY = 'kb.matchStrictness';

/** Legacy named levels → their floor, so older DBs migrate transparently on
 *  first read (the stored level is rewritten as a number). */
const LEGACY_LEVEL_FLOOR: Record<string, number> = { loose: 0.3, balanced: 0.4, strict: 0.5 };

const clampThreshold = (v: number): number =>
  Number(
    Math.min(
      MATCH_THRESHOLD_MAX,
      Math.max(MATCH_THRESHOLD_MIN, Math.round(v / MATCH_THRESHOLD_STEP) * MATCH_THRESHOLD_STEP),
    ).toFixed(2),
  );

/** Current match threshold. Lazy-seeds the default; migrates a legacy level
 *  string ('loose'|'balanced'|'strict') to its floor in place. */
export function getMatchThreshold(): number {
  const stored = readSetting<number | string>(STRICTNESS_KEY);
  if (
    typeof stored === 'number' &&
    stored >= MATCH_THRESHOLD_MIN &&
    stored <= MATCH_THRESHOLD_MAX
  ) {
    return stored;
  }
  const migrated =
    typeof stored === 'string' && stored in LEGACY_LEVEL_FLOOR
      ? LEGACY_LEVEL_FLOOR[stored]
      : DEFAULT_MATCH_THRESHOLD;
  writeSetting(STRICTNESS_KEY, migrated);
  return migrated;
}

export function setMatchThreshold(value: number): void {
  writeSetting(STRICTNESS_KEY, clampThreshold(value));
}

/** The cosine floor the retriever should use. */
export function getKbMinSimilarity(): number {
  return getMatchThreshold();
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
    hasEmbedding: row.contentEmbedding !== null && row.contentEmbedding !== undefined,
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

/** The two vectors stored per entry: `content` (Q+A, retrieval) and
 *  `question` (question-only, dedup). Both null when no embedding app. */
interface EntryVectors {
  content: Buffer | null;
  question: Buffer | null;
}

const NO_VECTORS: EntryVectors = { content: null, question: null };

/** Embed both vectors for an entry in ONE batched call — the embedding
 *  contract takes an array, so the two texts cost a single round-trip. */
async function embedEntry(question: string, answer: string): Promise<EntryVectors> {
  const instance = getActiveEmbeddingInstance();
  if (!instance) return NO_VECTORS;
  try {
    const result = await instance.embed({ texts: [embedText(question, answer), question] });
    const enc = (v: readonly number[] | undefined) =>
      v && v.length > 0 ? encodeEmbedding(v) : null;
    return { content: enc(result.vectors[0]), question: enc(result.vectors[1]) };
  } catch (err) {
    appLogger.error({ err }, 'knowledge entry embedding failed');
    return NO_VECTORS;
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
  const where =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

  const rows = db
    .select()
    .from(knowledgeEntries)
    .where(where)
    .orderBy(desc(knowledgeEntries.updatedAt))
    .all();
  return rows.map(toDTO);
}

export function getEntry(id: string): KnowledgeEntry {
  const row = db.select().from(knowledgeEntries).where(eq(knowledgeEntries.id, id)).get();
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
  const vectors = await embedEntry(input.question, input.answer);

  db.insert(knowledgeEntries)
    .values({
      id,
      question: input.question,
      answer: input.answer,
      topic: input.topic,
      status: 'approved',
      contentEmbedding: vectors.content,
      questionEmbedding: vectors.question,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getEntry(id);
}

export async function updateEntry(id: string, input: EntryInput): Promise<KnowledgeEntry> {
  const existing = db.select().from(knowledgeEntries).where(eq(knowledgeEntries.id, id)).get();
  if (!existing) throw new AppError('entry_not_found', 404);

  // Re-embed when the question/answer changed (both feed the content vector)
  // OR when either vector is missing — e.g. created before an embedding app
  // was connected, or a pre-rename row that has no question vector yet. A
  // manual edit should backfill both.
  const needsEmbed =
    existing.question !== input.question ||
    existing.answer !== input.answer ||
    existing.contentEmbedding === null ||
    existing.questionEmbedding === null;
  const vectors = needsEmbed
    ? await embedEntry(input.question, input.answer)
    : { content: existing.contentEmbedding, question: existing.questionEmbedding };

  db.update(knowledgeEntries)
    .set({
      question: input.question,
      answer: input.answer,
      topic: input.topic,
      contentEmbedding: vectors.content,
      questionEmbedding: vectors.question,
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

/* ── Bulk import + duplicate detection ─────────────────────────── */

/** Max entries per bulk request. Large files are sent by the client in
 *  sequential batches of this size, so the server bounds each transaction. */
export const BULK_MAX = 200;

/** Canonical form for duplicate comparison — defined once and shared by the
 *  bulk insert and the `/check` endpoint so "what counts as a duplicate" can
 *  never drift between the preview and the actual import. */
export function normalizeQuestion(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?!.]+$/, '');
}

/** normalized question → its original text, across the whole table. In-memory
 *  scan, consistent with `searchKnowledge`; fine to ~10k entries. */
function existingQuestionsByNorm(): Map<string, string> {
  const rows = db.select({ question: knowledgeEntries.question }).from(knowledgeEntries).all();
  const map = new Map<string, string>();
  for (const r of rows) map.set(normalizeQuestion(r.question), r.question);
  return map;
}

/** Cosine floor for calling two questions "the same". Higher than retrieval —
 *  dedup wants near-identical intent, not just relatedness. Tune against real
 *  imports. Question-to-question comparison (no answer dilution), so a clean
 *  threshold is meaningful. */
export const DEDUP_THRESHOLD = 0.9;

export interface DuplicateCheck {
  /** An existing entry has the same (normalized) question text. */
  exists: boolean;
  matchedQuestion?: string;
  /** Best semantic near-match (only when not an exact `exists` hit, and only
   *  in `semantic` mode). Advisory — a reworded version may already be covered. */
  similar?: { question: string; score: number };
}

export interface CheckResult {
  /** `semantic` when an embedding app is active (exact + vector matching);
   *  `exact` when none is — duplicate detection is then text-only and the UI
   *  should warn that reworded duplicates won't be caught. */
  mode: 'semantic' | 'exact';
  results: DuplicateCheck[];
}

/** Per-question duplicate detection against the KB, index-aligned with the
 *  input. Exact (normalized) matching always runs; when an embedding app is
 *  active we also embed the questions (one batched call) and flag semantic
 *  near-matches against existing question vectors. Powers the import preview. */
export async function checkDuplicates(questions: string[]): Promise<CheckResult> {
  const byNorm = existingQuestionsByNorm();
  const exact = questions.map((q) => byNorm.get(normalizeQuestion(q)));
  const base = (i: number): DuplicateCheck =>
    exact[i] ? { exists: true, matchedQuestion: exact[i] } : { exists: false };

  const instance = getActiveEmbeddingInstance();
  if (!instance) {
    return { mode: 'exact', results: questions.map((_, i) => base(i)) };
  }

  let vectors: readonly (readonly number[])[];
  try {
    ({ vectors } = await instance.embed({ texts: questions }));
  } catch (err) {
    // Embedding failed mid-check — degrade to exact rather than error out.
    appLogger.error({ err }, 'duplicate-check embedding failed');
    return { mode: 'exact', results: questions.map((_, i) => base(i)) };
  }

  const similar = findSimilarQuestions(vectors, DEDUP_THRESHOLD);
  return {
    mode: 'semantic',
    results: questions.map((_, i) => {
      const r = base(i);
      const sim = similar[i];
      // Exact hit already means "duplicate"; only surface `similar` otherwise.
      if (!r.exists && sim) {
        r.similar = { question: sim.question, score: Number(sim.similarity.toFixed(3)) };
      }
      return r;
    }),
  };
}

export interface BulkResult {
  inserted: number;
  skipped: number;
}

/**
 * Bulk-insert approved entries WITHOUT embedding — the re-embed-missing flow
 * backfills vectors, keeping import a fast DB-only op. Skips any entry whose
 * normalized question already exists OR repeats earlier in the same batch, so
 * re-running an import is idempotent (a retried batch just reports `skipped`).
 */
export function addEntries(pairs: EntryInput[]): BulkResult {
  // Seed with existing questions, then accumulate within-batch ones so dupes
  // inside the file are caught too.
  const seen = new Set<string>(existingQuestionsByNorm().keys());
  const now = new Date();

  const rows = [];
  for (const p of pairs) {
    const key = normalizeQuestion(p.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: randomUUID(),
      question: p.question,
      answer: p.answer,
      topic: p.topic,
      status: 'approved' as const,
      contentEmbedding: null,
      questionEmbedding: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (rows.length > 0) db.insert(knowledgeEntries).values(rows).run();
  return { inserted: rows.length, skipped: pairs.length - rows.length };
}

const REEMBED_JOB = 'kb-reembed';
const REEMBED_BATCH = 50;

/** Counts driving the KB banner / re-embed actions. `missing` = not yet
 *  searchable; `total` = approved entries (the re-embed-all target). */
export function embeddingCounts(): { missing: number; total: number } {
  const missing = db
    .select({ n: sql<number>`count(*)` })
    .from(knowledgeEntries)
    .where(isNull(knowledgeEntries.contentEmbedding))
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
      : isNull(knowledgeEntries.contentEmbedding);

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
      // One call embeds both vectors for the batch: content (Q+A) texts first,
      // then the question-only texts. Vector k → content[k]; B+k → question[k].
      const { vectors } = await instance.embed({
        texts: [
          ...batch.map((b) => embedText(b.question, b.answer)),
          ...batch.map((b) => b.question),
        ],
      });
      const now = new Date();
      for (let j = 0; j < batch.length; j++) {
        const content = vectors[j];
        const question = vectors[batch.length + j];
        if (!content || content.length === 0) continue;
        db.update(knowledgeEntries)
          .set({
            contentEmbedding: encodeEmbedding(content),
            questionEmbedding: question && question.length > 0 ? encodeEmbedding(question) : null,
            updatedAt: now,
          })
          .where(eq(knowledgeEntries.id, batch[j].id))
          .run();
      }
      ctx.tick(batch.length);
    }
  });
}
