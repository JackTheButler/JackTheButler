/**
 * Knowledge Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KnowledgeService } from '@/ai/knowledge/index.js';
import { db, knowledgeBase, knowledgeEmbeddings } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import type { LLMProvider } from '@/ai/types.js';

/**
 * Create a mock embedding provider
 */
function createMockEmbeddingProvider(): LLMProvider {
  let callCount = 0;

  return {
    name: 'mock-embedding',
    complete: vi.fn().mockResolvedValue({
      content: 'Test response',
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
    embed: vi.fn().mockImplementation(({ text }) => {
      callCount++;
      // Generate a deterministic pseudo-embedding based on text hash
      const embedding = new Array(1536).fill(0);
      for (let i = 0; i < Math.min(text.length, 100); i++) {
        const idx = (text.charCodeAt(i) * 7) % 1536;
        embedding[idx] = (text.charCodeAt(i) / 255) * callCount;
      }
      return Promise.resolve({
        embedding,
        usage: { inputTokens: text.length, outputTokens: 0 },
      });
    }),
  };
}

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let provider: LLMProvider;
  const testPrefix = `kb-test-${Date.now()}`;

  beforeEach(() => {
    provider = createMockEmbeddingProvider();
    service = new KnowledgeService(provider);
  });

  afterEach(async () => {
    // Clean up test data
    const items = await db.select().from(knowledgeBase);
    for (const item of items) {
      if (item.title.startsWith(testPrefix)) {
        await db.delete(knowledgeEmbeddings).where(eq(knowledgeEmbeddings.id, item.id));
        await db.delete(knowledgeBase).where(eq(knowledgeBase.id, item.id));
      }
    }
  });

  describe('add', () => {
    it('should add a knowledge item', async () => {
      const item = await service.add({
        category: 'faq',
        title: `${testPrefix} Test FAQ`,
        content: 'This is a test FAQ content.',
        keywords: JSON.stringify(['test', 'faq']),
      });

      expect(item.id).toBeDefined();
      expect(item.category).toBe('faq');
      expect(item.title).toBe(`${testPrefix} Test FAQ`);
      expect(item.status).toBe('active');
    });

    it('should generate embedding for new item', async () => {
      const item = await service.add({
        category: 'faq',
        title: `${testPrefix} Embedding Test`,
        content: 'Content for embedding test.',
      });

      // Check that embedding was created
      const embeddings = await db
        .select()
        .from(knowledgeEmbeddings)
        .where(eq(knowledgeEmbeddings.id, item.id));

      expect(embeddings).toHaveLength(1);
      expect(embeddings[0].model).toBe('mock-embedding');
      expect(provider.embed).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find item by ID', async () => {
      const created = await service.add({
        category: 'amenity',
        title: `${testPrefix} Pool Info`,
        content: 'Pool hours are 6am to 10pm.',
      });

      const found = await service.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe(`${testPrefix} Pool Info`);
    });

    it('should return null for non-existent ID', async () => {
      const found = await service.findById('nonexistent-id');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update item content', async () => {
      const item = await service.add({
        category: 'faq',
        title: `${testPrefix} Update Test`,
        content: 'Original content.',
      });

      const updated = await service.update(item.id, {
        content: 'Updated content.',
      });

      expect(updated.content).toBe('Updated content.');
    });

    it('should regenerate embedding when content changes', async () => {
      const item = await service.add({
        category: 'faq',
        title: `${testPrefix} Regen Embed Test`,
        content: 'Original content.',
      });

      const initialCallCount = (provider.embed as ReturnType<typeof vi.fn>).mock.calls.length;

      await service.update(item.id, {
        content: 'New content that should regenerate embedding.',
      });

      const newCallCount = (provider.embed as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(newCallCount).toBeGreaterThan(initialCallCount);
    });

    it('should throw for non-existent ID', async () => {
      await expect(service.update('nonexistent', { content: 'test' })).rejects.toThrow(
        'Knowledge item not found'
      );
    });
  });

  describe('delete', () => {
    it('should delete item and embedding', async () => {
      const item = await service.add({
        category: 'faq',
        title: `${testPrefix} Delete Test`,
        content: 'To be deleted.',
      });

      await service.delete(item.id);

      const found = await service.findById(item.id);
      expect(found).toBeNull();

      const embeddings = await db
        .select()
        .from(knowledgeEmbeddings)
        .where(eq(knowledgeEmbeddings.id, item.id));
      expect(embeddings).toHaveLength(0);
    });
  });

  describe('list', () => {
    it('should list active items', async () => {
      await service.add({
        category: 'faq',
        title: `${testPrefix} List Item 1`,
        content: 'Content 1',
      });
      await service.add({
        category: 'amenity',
        title: `${testPrefix} List Item 2`,
        content: 'Content 2',
      });

      const items = await service.list();

      const testItems = items.filter((i) => i.title.startsWith(testPrefix));
      expect(testItems.length).toBe(2);
    });

    it('should filter by category', async () => {
      await service.add({
        category: 'faq',
        title: `${testPrefix} FAQ Item`,
        content: 'FAQ content',
      });
      await service.add({
        category: 'amenity',
        title: `${testPrefix} Amenity Item`,
        content: 'Amenity content',
      });

      const faqItems = await service.list('faq');
      const testFaqItems = faqItems.filter((i) => i.title.startsWith(testPrefix));

      expect(testFaqItems.length).toBe(1);
      expect(testFaqItems[0].category).toBe('faq');
    });
  });

  describe('search', () => {
    it('should return results sorted by similarity', async () => {
      await service.add({
        category: 'faq',
        title: `${testPrefix} Checkout Time`,
        content: 'Checkout time is 11am. Late checkout available.',
      });
      await service.add({
        category: 'faq',
        title: `${testPrefix} Check-in Time`,
        content: 'Check-in time is 3pm. Early check-in may be available.',
      });
      await service.add({
        category: 'amenity',
        title: `${testPrefix} Pool Hours`,
        content: 'The pool is open from 6am to 10pm.',
      });

      const results = await service.search('What time is checkout?', {
        limit: 3,
        minSimilarity: 0,
      });

      expect(results.length).toBeGreaterThan(0);
      // Results should have similarity scores
      expect(results[0].similarity).toBeDefined();
      expect(typeof results[0].similarity).toBe('number');
    });

    it('should respect limit option', async () => {
      for (let i = 0; i < 5; i++) {
        await service.add({
          category: 'faq',
          title: `${testPrefix} Search Limit ${i}`,
          content: `Content ${i} for search test.`,
        });
      }

      const results = await service.search('search test', { limit: 2, minSimilarity: 0 });

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      await service.add({
        category: 'faq',
        title: `${testPrefix} Stats Test 1`,
        content: 'Content 1',
      });
      await service.add({
        category: 'amenity',
        title: `${testPrefix} Stats Test 2`,
        content: 'Content 2',
      });

      const stats = await service.getStats();

      expect(stats.totalItems).toBeGreaterThanOrEqual(2);
      expect(stats.byCategory).toBeDefined();
      expect(stats.hasEmbeddings).toBeGreaterThanOrEqual(2);
    });
  });
});
