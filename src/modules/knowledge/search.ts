import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client.js';
import { knowledgeEntries } from '@/db/schema/index.js';

/**
 * Vector search over knowledge entries — the shared cosine core used by both
 * the AI pipeline (retrieval) and duplicate detection. Lives in the knowledge
 * module (not the pipeline) so the pipeline can depend on it without a cycle,
 * and returns a domain shape; presentation mapping (e.g. to the pipeline's
 * KnowledgeHit) is the caller's job.
 *
 * In-process scan over approved, embedded rows — fine to ~10k entries; swap to
 * sqlite-vec only if that stops being fast enough.
 */

export function decodeEmbedding(blob: Buffer | Uint8Array): Float32Array {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

export function cosine(a: readonly number[], b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface KnowledgeMatch {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  similarity: number;
}

/** Diagnostics alongside the hits so callers can explain an empty result:
 *  `candidates` = approved + embedded rows scanned; `bestScore` = top cosine
 *  seen even when it's below the threshold. */
export interface KnowledgeSearchResult {
  hits: KnowledgeMatch[];
  candidates: number;
  bestScore: number | null;
}

export function searchKnowledge(
  embedding: readonly number[],
  limit: number,
  minSim: number,
): KnowledgeSearchResult {
  const rows = db
    .select({
      id: knowledgeEntries.id,
      question: knowledgeEntries.question,
      answer: knowledgeEntries.answer,
      topic: knowledgeEntries.topic,
      embedding: knowledgeEntries.contentEmbedding,
    })
    .from(knowledgeEntries)
    .where(
      and(eq(knowledgeEntries.status, 'approved'), isNotNull(knowledgeEntries.contentEmbedding)),
    )
    .all();

  let bestScore: number | null = null;
  const scored: KnowledgeMatch[] = [];
  for (const row of rows) {
    if (!row.embedding) continue;
    const similarity = cosine(embedding, decodeEmbedding(row.embedding as Buffer));
    if (bestScore === null || similarity > bestScore) bestScore = similarity;
    if (similarity < minSim) continue;
    scored.push({
      id: row.id,
      question: row.question,
      answer: row.answer,
      topic: row.topic,
      similarity,
    });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return { hits: scored.slice(0, limit), candidates: rows.length, bestScore };
}

/**
 * For each input vector, the single best existing entry by QUESTION-vector
 * cosine, or null when nothing clears `minSim`. Used for duplicate detection,
 * so it compares against `question_embedding` (question-to-question) — not the
 * Q+A `content_embedding` retrieval uses. Decodes the existing vectors once
 * and reuses them across all inputs (N×M cosine, M decodes).
 */
export function findSimilarQuestions(
  vectors: readonly (readonly number[])[],
  minSim: number,
): (KnowledgeMatch | null)[] {
  const rows = db
    .select({
      id: knowledgeEntries.id,
      question: knowledgeEntries.question,
      answer: knowledgeEntries.answer,
      topic: knowledgeEntries.topic,
      embedding: knowledgeEntries.questionEmbedding,
    })
    .from(knowledgeEntries)
    .where(
      and(eq(knowledgeEntries.status, 'approved'), isNotNull(knowledgeEntries.questionEmbedding)),
    )
    .all();

  const decoded = rows.map((r) => ({ row: r, vec: decodeEmbedding(r.embedding as Buffer) }));

  return vectors.map((v) => {
    let best: KnowledgeMatch | null = null;
    let bestScore = minSim;
    for (const { row, vec } of decoded) {
      const s = cosine(v, vec);
      if (s >= bestScore) {
        bestScore = s;
        best = {
          id: row.id,
          question: row.question,
          answer: row.answer,
          topic: row.topic,
          similarity: s,
        };
      }
    }
    return best;
  });
}
