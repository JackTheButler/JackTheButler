/**
 * Memory Service
 *
 * Manages persistent guest memory facts learned across conversations.
 * Handles CRUD operations and deduplication against the guest_memories table.
 *
 * Instantiate with an AIProvider to enable deduplication and embedding on write.
 * Instantiate without a provider for read-only operations (list, get, delete).
 */

import { eq, desc, sql } from 'drizzle-orm';
import { db, sqlite, guestMemories } from '@/db/index.js';
import type { GuestMemory } from '@/db/schema.js';
import type { AIProvider } from '@/ai/types.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { NotFoundError } from '@/errors/index.js';
import { now } from '@/utils/time.js';

const log = createLogger('memory');

/**
 * A discrete fact about a guest, as returned by the AI extractor
 * or submitted manually by staff.
 */
export interface MemoryFact {
  category: 'preference' | 'complaint' | 'habit' | 'personal' | 'request';
  content: string;
  confidence: number;
}

type DedupeClassification = 'CONFIRMS' | 'CONTRADICTS' | 'DIFFERENT';

export class MemoryService {
  private readonly completionProvider: AIProvider | undefined;
  private readonly embeddingProvider: AIProvider | undefined;

  constructor(completionProvider?: AIProvider, embeddingProvider?: AIProvider) {
    this.completionProvider = completionProvider;
    this.embeddingProvider = embeddingProvider;
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Insert one or more memory facts for a guest.
   *
   * When a provider is available:
   *  - Embeds each incoming fact and searches for near-matches (cosine > 0.85)
   *  - Classifies near-matches as CONFIRMS, CONTRADICTS, or DIFFERENT
   *  - CONFIRMS  → bumps last_reinforced_at, increases confidence by 0.1
   *  - CONTRADICTS → replaces content and resets confidence
   *  - DIFFERENT / no match → inserts a new row
   *
   * Without a provider: plain insert, embedding stays null (graceful degradation).
   */
  async insert(
    guestId: string,
    conversationId: string | null,
    facts: MemoryFact[],
    source: 'ai_extracted' | 'manual' | 'pms' = 'ai_extracted',
  ): Promise<GuestMemory[]> {
    if (facts.length === 0) return [];

    const results: GuestMemory[] = [];
    const timestamp = now();

    for (const fact of facts) {
      // Attempt to embed for dedup — null means no provider or embed failed
      let embeddingBuf: Buffer | null = null;
      if (this.embeddingProvider) {
        try {
          const { embedding } = await this.embeddingProvider.embed({ text: fact.content });
          embeddingBuf = Buffer.from(new Float32Array(embedding).buffer);
        } catch (err) {
          log.warn({ err }, 'Failed to embed fact — inserting without dedup check');
        }
      }

      // Dedup: find nearest existing memory for this guest
      if (embeddingBuf) {
        const match = this.findNearMatch(guestId, embeddingBuf);
        if (match) {
          const classification = await this.classify(match.content, fact.content);

          if (classification === 'CONFIRMS') {
            await db
              .update(guestMemories)
              .set({
                lastReinforcedAt: timestamp,
                confidence: Math.min(1.0, match.confidence + 0.1),
              })
              .where(eq(guestMemories.id, match.id));

            log.debug({ memoryId: match.id, guestId }, 'Memory reinforced');
            const [row] = await db.select().from(guestMemories).where(eq(guestMemories.id, match.id)).limit(1);
            results.push(row!);
            continue;
          }

          if (classification === 'CONTRADICTS') {
            await db
              .update(guestMemories)
              .set({
                content: fact.content,
                confidence: fact.confidence,
                lastReinforcedAt: timestamp,
                embedding: embeddingBuf,
              })
              .where(eq(guestMemories.id, match.id));

            log.debug({ memoryId: match.id, guestId }, 'Memory updated (contradiction)');
            const [row] = await db.select().from(guestMemories).where(eq(guestMemories.id, match.id)).limit(1);
            results.push(row!);
            continue;
          }

          // DIFFERENT — fall through to insert as a new row
        }
      }

      // New row
      const id = generateId('memory');
      await db.insert(guestMemories).values({
        id,
        guestId,
        conversationId,
        category: fact.category,
        content: fact.content,
        source,
        confidence: fact.confidence,
        embedding: embeddingBuf,
        createdAt: timestamp,
        lastReinforcedAt: timestamp,
      });

      const [row] = await db.select().from(guestMemories).where(eq(guestMemories.id, id)).limit(1);
      results.push(row!);
    }

    log.info({ guestId, count: facts.length, source }, 'Processed guest memories');
    return results;
  }

  /**
   * Store a binary float32 embedding for an existing memory.
   */
  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    await db
      .update(guestMemories)
      .set({ embedding: Buffer.from(new Float32Array(embedding).buffer) })
      .where(eq(guestMemories.id, id));

    log.debug({ memoryId: id, dimensions: embedding.length }, 'Updated memory embedding');
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Return the top K most relevant memories for a guest.
   *
   * When queryEmbedding is provided: ranks by cosine similarity using sqlite-vec.
   * Falls back to recency order (last_reinforced_at DESC) when no embedding is
   * given or when no memories have embeddings yet.
   */
  async recall(guestId: string, queryEmbedding?: number[], topK = 5): Promise<GuestMemory[]> {
    if (queryEmbedding) {
      const queryBuf = Buffer.from(new Float32Array(queryEmbedding).buffer);

      // Rank by cosine distance ASC (lower = more similar) — only rows with embeddings
      const ranked = sqlite
        .prepare(
          `SELECT id
           FROM guest_memories
           WHERE guest_id = ?
             AND embedding IS NOT NULL
           ORDER BY vec_distance_cosine(embedding, vec_f32(?)) ASC
           LIMIT ?`,
        )
        .all(guestId, queryBuf, topK) as Array<{ id: string }>;

      if (ranked.length > 0) {
        const ids = ranked.map((r) => r.id);
        const rows = await db
          .select()
          .from(guestMemories)
          .where(sql`${guestMemories.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);

        // Restore similarity order (IN clause does not guarantee order)
        const order = new Map(ids.map((id, i) => [id, i]));
        return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      }
    }

    // Recency fallback — most recently reinforced first
    return db
      .select()
      .from(guestMemories)
      .where(eq(guestMemories.guestId, guestId))
      .orderBy(desc(guestMemories.lastReinforcedAt))
      .limit(topK);
  }

  /**
   * List all memories for a guest, most recently reinforced first.
   */
  async listForGuest(guestId: string): Promise<GuestMemory[]> {
    return db
      .select()
      .from(guestMemories)
      .where(eq(guestMemories.guestId, guestId))
      .orderBy(desc(guestMemories.lastReinforcedAt));
  }

  /**
   * Get a single memory by ID. Throws NotFoundError if missing.
   */
  async getById(id: string): Promise<GuestMemory> {
    const [row] = await db.select().from(guestMemories).where(eq(guestMemories.id, id)).limit(1);
    if (!row) throw new NotFoundError('GuestMemory', id);
    return row;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Update the category and/or content of a memory.
   * When content changes, the embedding is cleared so the next recall cycle
   * will regenerate it (consistent with how manual memories are created).
   */
  async update(
    id: string,
    patch: { category?: MemoryFact['category']; content?: string },
  ): Promise<GuestMemory> {
    const existing = await this.getById(id);

    await db
      .update(guestMemories)
      .set({
        ...(patch.category && { category: patch.category }),
        ...(patch.content && { content: patch.content }),
        // Clear embedding when content changes — will be regenerated on next recall
        ...(patch.content && patch.content !== existing.content && { embedding: null }),
        lastReinforcedAt: now(),
      })
      .where(eq(guestMemories.id, id));

    const [row] = await db.select().from(guestMemories).where(eq(guestMemories.id, id)).limit(1);
    log.info({ memoryId: id }, 'Updated guest memory');
    return row!;
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * Delete a memory by ID. Throws NotFoundError if missing.
   */
  async delete(id: string): Promise<void> {
    await this.getById(id);
    await db.delete(guestMemories).where(eq(guestMemories.id, id));
    log.info({ memoryId: id }, 'Deleted guest memory');
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Find the closest existing memory for a guest using sqlite-vec cosine similarity.
   * Returns null if no embeddings exist or none meet the threshold.
   */
  private findNearMatch(
    guestId: string,
    embeddingBuf: Buffer,
    threshold = 0.85,
  ): { id: string; content: string; confidence: number; similarity: number } | null {
    const row = sqlite
      .prepare(
        `SELECT id, content, confidence,
                (1.0 - vec_distance_cosine(embedding, vec_f32(?))) AS similarity
         FROM guest_memories
         WHERE guest_id = ?
           AND embedding IS NOT NULL
         ORDER BY similarity DESC
         LIMIT 1`,
      )
      .get(embeddingBuf, guestId) as
      | { id: string; content: string; confidence: number; similarity: number }
      | undefined;

    if (!row || row.similarity < threshold) return null;
    return row;
  }

  /**
   * Ask the AI whether two facts confirm, contradict, or are unrelated.
   * Defaults to DIFFERENT on any error so insertion is always safe.
   */
  private async classify(existingContent: string, incomingContent: string): Promise<DedupeClassification> {
    if (!this.completionProvider) return 'DIFFERENT';
    try {
      const response = await this.completionProvider.complete({
        modelTier: 'utility',
        temperature: 0,
        maxTokens: 10,
        messages: [
          {
            role: 'system',
            content: 'You are a fact classifier. Reply with exactly one word: CONFIRMS, CONTRADICTS, or DIFFERENT.',
          },
          {
            role: 'user',
            content: `Fact A: "${existingContent}"\nFact B: "${incomingContent}"\n\nDo these two facts confirm the same thing, contradict each other, or are they about completely different things?\nReply with exactly one word: CONFIRMS, CONTRADICTS, or DIFFERENT.`,
          },
        ],
      });
      const upper = response.content.toUpperCase();
      if (upper.includes('CONFIRMS')) return 'CONFIRMS';
      if (upper.includes('CONTRADICTS')) return 'CONTRADICTS';
      return 'DIFFERENT';
    } catch {
      return 'DIFFERENT';
    }
  }
}

/**
 * Singleton for read-only operations (list, get, delete).
 * For writes with embedding + deduplication, instantiate with:
 *   new MemoryService(completionProvider, embeddingProvider)
 */
export const memoryService = new MemoryService();
