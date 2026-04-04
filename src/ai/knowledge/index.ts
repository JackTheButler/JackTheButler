/**
 * Knowledge Service
 *
 * Manages the hotel knowledge base for RAG (Retrieval-Augmented Generation).
 * Stores FAQ, policies, amenities, and other information with vector embeddings.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { NotFoundError, AppError } from '@/errors/index.js';
import { knowledgeBase, knowledgeEmbeddings } from '@/db/schema.js';
import type { KnowledgeItem, NewKnowledgeItem } from '@/db/schema.js';
import type { LLMProvider } from '../types.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { now } from '@/utils/time.js';

const log = createLogger('ai:knowledge');

/**
 * Knowledge search result with similarity score
 */
export interface KnowledgeSearchResult extends KnowledgeItem {
  similarity: number;
}

/**
 * Options for knowledge search
 */
export interface SearchOptions {
  limit?: number | undefined;
  category?: string | undefined;
  minSimilarity?: number | undefined;
}

/**
 * Knowledge service for managing and searching hotel information
 */
export class KnowledgeService {
  private embeddingProvider: LLMProvider | undefined;
  private embeddingModel: string;

  constructor(embeddingProvider?: LLMProvider) {
    this.embeddingProvider = embeddingProvider;
    this.embeddingModel = embeddingProvider?.name ?? 'none';
    if (embeddingProvider) {
      log.info({ provider: this.embeddingModel }, 'Knowledge service initialized');
    }
  }

  private requireProvider(): LLMProvider {
    if (!this.embeddingProvider) throw new AppError('KnowledgeService: embedding provider required for this operation', 'PROVIDER_REQUIRED');
    return this.embeddingProvider;
  }

  /**
   * Add a new knowledge item with embedding
   */
  async add(item: Omit<NewKnowledgeItem, 'id'>): Promise<KnowledgeItem> {
    const id = generateId('knowledge');

    // Insert knowledge item
    await db.insert(knowledgeBase).values({
      id,
      ...item,
    });

    // Generate and store embedding
    await this.generateEmbedding(id, item.content);

    const created = await this.findById(id);
    if (!created) {
      throw new AppError('Failed to create knowledge item', 'INTERNAL_ERROR', 500);
    }

    log.info({ id, category: item.category, title: item.title }, 'Knowledge item added');
    return created;
  }

  /**
   * Add multiple knowledge items in batch
   */
  async addBatch(items: Omit<NewKnowledgeItem, 'id'>[]): Promise<KnowledgeItem[]> {
    const results: KnowledgeItem[] = [];

    for (const item of items) {
      const created = await this.add(item);
      results.push(created);
    }

    log.info({ count: results.length }, 'Knowledge items batch added');
    return results;
  }

  /**
   * Find a knowledge item by ID
   */
  async findById(id: string): Promise<KnowledgeItem | null> {
    const result = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).limit(1);

    return result[0] ?? null;
  }

  /**
   * Update a knowledge item
   */
  async update(id: string, updates: Partial<Omit<NewKnowledgeItem, 'id'>>): Promise<KnowledgeItem> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError('KnowledgeItem', id);
    }

    await db
      .update(knowledgeBase)
      .set({
        ...updates,
        updatedAt: now(),
      })
      .where(eq(knowledgeBase.id, id));

    // Regenerate embedding if content changed
    if (updates.content) {
      await this.generateEmbedding(id, updates.content);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new AppError('Failed to update knowledge item', 'INTERNAL_ERROR', 500);
    }

    log.info({ id }, 'Knowledge item updated');
    return updated;
  }

  /**
   * Delete a knowledge item
   */
  async delete(id: string): Promise<void> {
    // Embedding is deleted automatically via cascade
    await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id));
    log.info({ id }, 'Knowledge item deleted');
  }

  /**
   * List all knowledge items
   */
  async list(category?: string): Promise<KnowledgeItem[]> {
    if (category) {
      return db
        .select()
        .from(knowledgeBase)
        .where(and(eq(knowledgeBase.category, category), eq(knowledgeBase.status, 'active')))
        .orderBy(desc(knowledgeBase.priority));
    }

    return db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.status, 'active'))
      .orderBy(desc(knowledgeBase.priority));
  }

  /**
   * Search knowledge base using vector similarity.
   * Computes the embedding from the query text then delegates to searchByEmbedding.
   */
  async search(query: string, options: SearchOptions = {}): Promise<KnowledgeSearchResult[]> {
    log.debug({ query, limit: options.limit }, 'Searching knowledge base');
    const queryEmbedding = await this.requireProvider().embed({ text: query });
    return this.searchByEmbedding(queryEmbedding.embedding, options);
  }

  /**
   * Search knowledge base using a pre-computed embedding.
   * Does not call the embedding provider — accepts the vector directly.
   * Used by the pipeline when ctx.queryEmbedding has already been computed upstream.
   */
  async searchByEmbedding(embedding: number[], options: SearchOptions = {}): Promise<KnowledgeSearchResult[]> {
    const { limit = 5, category, minSimilarity = 0.5 } = options;

    // Get all stored embeddings and compute cosine similarity
    const storedEmbeddings = await db.select().from(knowledgeEmbeddings);
    const similarities: { id: string; similarity: number }[] = [];

    for (const row of storedEmbeddings) {
      const stored = JSON.parse(row.embedding) as number[];
      const similarity = this.cosineSimilarity(embedding, stored);
      if (similarity >= minSimilarity) {
        similarities.push({ id: row.id, similarity });
      }
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    const topIds = similarities.slice(0, limit).map((s) => s.id);

    if (topIds.length === 0) return [];

    const items = await db
      .select()
      .from(knowledgeBase)
      .where(
        and(
          sql`${knowledgeBase.id} IN (${sql.join(topIds.map((id) => sql`${id}`), sql`, `)})`,
          eq(knowledgeBase.status, 'active'),
          category ? eq(knowledgeBase.category, category) : sql`1=1`
        )
      );

    const results: KnowledgeSearchResult[] = items.map((item) => ({
      ...item,
      similarity: similarities.find((s) => s.id === item.id)?.similarity ?? 0,
    }));

    results.sort((a, b) => b.similarity - a.similarity);
    log.debug({ resultCount: results.length }, 'Knowledge search by embedding complete');
    return results;
  }

  /**
   * Generate and store embedding for a knowledge item
   */
  private async generateEmbedding(id: string, content: string): Promise<void> {
    const response = await this.requireProvider().embed({ text: content });

    // Delete existing embedding if any
    await db.delete(knowledgeEmbeddings).where(eq(knowledgeEmbeddings.id, id));

    // Store new embedding
    await db.insert(knowledgeEmbeddings).values({
      id,
      embedding: JSON.stringify(response.embedding),
      model: this.embeddingModel,
      dimensions: response.embedding.length,
    });
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      // Fallback: return 0 for mismatched dimensions
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Get statistics about the knowledge base
   */
  async getStats(): Promise<{
    totalItems: number;
    byCategory: Record<string, number>;
    hasEmbeddings: number;
  }> {
    const items = await db.select().from(knowledgeBase);
    const embeddings = await db.select({ id: knowledgeEmbeddings.id }).from(knowledgeEmbeddings);

    const byCategory: Record<string, number> = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    }

    return {
      totalItems: items.length,
      byCategory,
      hasEmbeddings: embeddings.length,
    };
  }
}

export { KnowledgeService as default };
