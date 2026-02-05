/**
 * Site Scraper - Semantic Deduplication
 *
 * Uses embeddings for cosine similarity-based deduplication.
 * Falls back to Levenshtein similarity when embedding provider is unavailable.
 *
 * @module extensions/tools/site-scraper/deduplicator
 */

import { getAppRegistry } from '../../registry.js';
import { logger } from '@/utils/logger.js';
import { db, knowledgeEmbeddings, knowledgeBase } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import type { AIExtractedEntry } from './ai-parser.js';

/**
 * A detected duplicate pair
 */
export interface DuplicatePair {
  /** Index of the new entry */
  newIndex: number;
  /** Title of the duplicate match */
  matchTitle: string;
  /** Whether the match is an existing KB entry (vs another new entry) */
  isExisting: boolean;
  /** Cosine similarity score */
  similarity: number;
}

/**
 * Result of deduplication
 */
export interface DeduplicationResult {
  entries: AIExtractedEntry[];
  duplicates: DuplicatePair[];
}

const SIMILARITY_THRESHOLD = 0.90;

/**
 * Deduplicate entries using semantic similarity.
 * Compares new-vs-new and new-vs-existing knowledge base entries.
 */
export async function deduplicateEntries(entries: AIExtractedEntry[]): Promise<DeduplicationResult> {
  const registry = getAppRegistry();
  const embeddingProvider = registry.getEmbeddingProvider();

  if (!embeddingProvider) {
    logger.warn('No embedding provider, falling back to Levenshtein dedup');
    return levenshteinDedup(entries);
  }

  try {
    return await semanticDedup(entries, embeddingProvider);
  } catch (error) {
    logger.error({ error }, 'Semantic dedup failed, falling back to Levenshtein');
    return levenshteinDedup(entries);
  }
}

/**
 * Semantic deduplication using embeddings
 */
async function semanticDedup(
  entries: AIExtractedEntry[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embeddingProvider: any
): Promise<DeduplicationResult> {
  const duplicates: DuplicatePair[] = [];

  // Generate embeddings for new entries
  const newEmbeddings: number[][] = [];
  for (const entry of entries) {
    const text = `${entry.title}\n${entry.content}`.substring(0, 1000);
    const response = await embeddingProvider.embed({ text });
    newEmbeddings.push(response.embedding);
  }

  // Load existing embeddings from knowledge base
  const existingRows = await db
    .select({
      id: knowledgeEmbeddings.id,
      embedding: knowledgeEmbeddings.embedding,
    })
    .from(knowledgeEmbeddings)
    .all();

  // Build a map of existing KB titles
  const existingTitleMap = new Map<string, string>();
  if (existingRows.length > 0) {
    const existingIds = existingRows.map((r) => r.id);
    for (const eid of existingIds) {
      const kbEntry = await db
        .select({ title: knowledgeBase.title })
        .from(knowledgeBase)
        .where(eq(knowledgeBase.id, eid))
        .get();
      if (kbEntry) {
        existingTitleMap.set(eid, kbEntry.title);
      }
    }
  }

  const existingEmbeddings = existingRows.map((r) => ({
    id: r.id,
    embedding: JSON.parse(r.embedding) as number[],
  }));

  // Compare new-vs-new
  for (let i = 0; i < newEmbeddings.length; i++) {
    for (let j = i + 1; j < newEmbeddings.length; j++) {
      const sim = cosineSimilarity(newEmbeddings[i]!, newEmbeddings[j]!);
      if (sim > SIMILARITY_THRESHOLD) {
        duplicates.push({
          newIndex: j,
          matchTitle: entries[i]!.title,
          isExisting: false,
          similarity: sim,
        });
      }
    }
  }

  // Compare new-vs-existing
  for (let i = 0; i < newEmbeddings.length; i++) {
    for (const existing of existingEmbeddings) {
      const sim = cosineSimilarity(newEmbeddings[i]!, existing.embedding);
      if (sim > SIMILARITY_THRESHOLD) {
        duplicates.push({
          newIndex: i,
          matchTitle: existingTitleMap.get(existing.id) || 'Existing entry',
          isExisting: true,
          similarity: sim,
        });
        break; // Only report highest existing match per new entry
      }
    }
  }

  return { entries, duplicates };
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;

  return dot / magnitude;
}

/**
 * Fallback: Levenshtein-based deduplication
 */
function levenshteinDedup(entries: AIExtractedEntry[]): DeduplicationResult {
  const duplicates: DuplicatePair[] = [];

  for (let i = 0; i < entries.length; i++) {
    const titleA = entries[i]!.title.toLowerCase().replace(/\s+/g, ' ').trim();

    for (let j = i + 1; j < entries.length; j++) {
      const titleB = entries[j]!.title.toLowerCase().replace(/\s+/g, ' ').trim();

      if (titleA === titleB || levenshteinSimilarity(titleA, titleB) > 0.8) {
        duplicates.push({
          newIndex: j,
          matchTitle: entries[i]!.title,
          isExisting: false,
          similarity: levenshteinSimilarity(titleA, titleB),
        });
      }
    }
  }

  return { entries, duplicates };
}

/**
 * Calculate Levenshtein similarity between two strings
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = matrix[i];
      const prevRow = matrix[i - 1];
      if (row && prevRow) {
        row[j] = Math.min(
          (prevRow[j] ?? 0) + 1,
          (row[j - 1] ?? 0) + 1,
          (prevRow[j - 1] ?? 0) + cost
        );
      }
    }
  }

  const lastRow = matrix[a.length];
  const distance = lastRow?.[b.length] ?? 0;
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}
