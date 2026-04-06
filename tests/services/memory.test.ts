/**
 * Memory Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/db/index.js';
import { guestMemories, guests } from '@/db/schema.js';
import { MemoryService } from '@/services/memory.js';
import { eq } from 'drizzle-orm';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import type { AIProvider } from '@/core/ai/types.js';

// A mock embedding that produces high cosine similarity to itself
const SIMILAR_VEC = Array.from({ length: 8 }, (_, i) => (i + 1) * 0.1);
const DIFFERENT_VEC = [0, 0, 0, 0, 0, 0, 0, 1]; // orthogonal-ish

function makeProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({ content: 'DIFFERENT', usage: { inputTokens: 5, outputTokens: 1 } }),
    embed: vi.fn().mockResolvedValue({ embedding: SIMILAR_VEC, usage: { inputTokens: 5, outputTokens: 0 } }),
    ...overrides,
  };
}

describe('MemoryService', () => {
  let guestId: string;

  beforeEach(async () => {
    guestId = generateId('guest');
    await db.insert(guests).values({
      id: guestId,
      firstName: 'Memory',
      lastName: 'Test',
      createdAt: now(),
      updatedAt: now(),
    });
    await db.delete(guestMemories).where(eq(guestMemories.guestId, guestId));
  });

  describe('insert (no provider — plain insert)', () => {
    let service: MemoryService;
    beforeEach(() => { service = new MemoryService(); });

    it('inserts a single memory fact', async () => {
      const result = await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers a quiet room', confidence: 0.9 },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.guestId).toBe(guestId);
      expect(result[0]!.category).toBe('preference');
      expect(result[0]!.content).toBe('Prefers a quiet room');
      expect(result[0]!.confidence).toBe(0.9);
      expect(result[0]!.source).toBe('ai_extracted');
      expect(result[0]!.embedding).toBeNull();
    });

    it('inserts multiple facts', async () => {
      const result = await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers a quiet room', confidence: 0.9 },
        { category: 'habit', content: 'Always orders room service for breakfast', confidence: 0.8 },
        { category: 'personal', content: 'Travelling with a dog', confidence: 1.0 },
      ]);
      expect(result).toHaveLength(3);
    });

    it('returns empty array for empty facts', async () => {
      expect(await service.insert(guestId, null, [])).toHaveLength(0);
    });

    it('stores null conversationId when none is provided', async () => {
      const [mem] = await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers feather-free pillows', confidence: 1.0 },
      ]);
      expect(mem!.conversationId).toBeNull();
    });

    it('respects the source parameter', async () => {
      const [mem] = await service.insert(guestId, null, [
        { category: 'preference', content: 'Manually noted preference', confidence: 1.0 },
      ], 'manual');
      expect(mem!.source).toBe('manual');
    });

    it('inserts two identical facts without dedup when no provider', async () => {
      const fact = { category: 'preference' as const, content: 'Prefers quiet rooms', confidence: 0.9 };
      await service.insert(guestId, null, [fact]);
      await service.insert(guestId, null, [fact]);

      const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
      expect(stored).toHaveLength(2);
    });
  });

  describe('insert (with provider — deduplication)', () => {
    it('CONFIRMS: reinforces existing memory instead of inserting new row', async () => {
      const provider = makeProvider({
        complete: vi.fn().mockResolvedValue({ content: 'CONFIRMS', usage: { inputTokens: 5, outputTokens: 1 } }),
      });
      const service = new MemoryService(provider);

      const [first] = await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers a quiet room', confidence: 0.8 },
      ]);
      const originalReinforcedAt = first!.lastReinforcedAt;

      // Small delay to ensure timestamp advances
      await new Promise((r) => setTimeout(r, 5));

      await service.insert(guestId, null, [
        { category: 'preference', content: 'Always requests a quiet room', confidence: 0.9 },
      ]);

      const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
      expect(stored).toHaveLength(1);
      expect(stored[0]!.confidence).toBeCloseTo(0.9); // 0.8 + 0.1
      expect(stored[0]!.lastReinforcedAt > originalReinforcedAt).toBe(true);
    });

    it('CONFIRMS: caps confidence at 1.0', async () => {
      const provider = makeProvider({
        complete: vi.fn().mockResolvedValue({ content: 'CONFIRMS', usage: { inputTokens: 5, outputTokens: 1 } }),
      });
      const service = new MemoryService(provider);

      await service.insert(guestId, null, [{ category: 'preference', content: 'Quiet room', confidence: 1.0 }]);
      await service.insert(guestId, null, [{ category: 'preference', content: 'Quiet room please', confidence: 1.0 }]);

      const [stored] = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
      expect(stored!.confidence).toBe(1.0);
    });

    it('CONTRADICTS: replaces content and resets confidence', async () => {
      const provider = makeProvider({
        complete: vi.fn().mockResolvedValue({ content: 'CONTRADICTS', usage: { inputTokens: 5, outputTokens: 1 } }),
      });
      const service = new MemoryService(provider);

      await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers a quiet room', confidence: 0.9 },
      ]);
      await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers a room near the elevator', confidence: 0.8 },
      ]);

      const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
      expect(stored).toHaveLength(1);
      expect(stored[0]!.content).toBe('Prefers a room near the elevator');
      expect(stored[0]!.confidence).toBe(0.8);
    });

    it('DIFFERENT: inserts new row despite high similarity', async () => {
      const provider = makeProvider({
        complete: vi.fn().mockResolvedValue({ content: 'DIFFERENT', usage: { inputTokens: 5, outputTokens: 1 } }),
      });
      const service = new MemoryService(provider);

      await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers quiet rooms', confidence: 0.9 },
      ]);
      await service.insert(guestId, null, [
        { category: 'personal', content: 'Allergic to feather pillows', confidence: 1.0 },
      ]);

      const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
      expect(stored).toHaveLength(2);
    });

    it('inserts new row when similarity is below threshold', async () => {
      // First fact uses SIMILAR_VEC, second fact returns a very different vector
      const provider = makeProvider();
      const embedMock = provider.embed as ReturnType<typeof vi.fn>;
      embedMock
        .mockResolvedValueOnce({ embedding: SIMILAR_VEC })
        .mockResolvedValueOnce({ embedding: DIFFERENT_VEC });

      const service = new MemoryService(provider);

      await service.insert(guestId, null, [{ category: 'preference', content: 'Quiet room', confidence: 0.9 }]);
      await service.insert(guestId, null, [{ category: 'personal', content: 'Travelling with a dog', confidence: 1.0 }]);

      const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
      expect(stored).toHaveLength(2);
      // classify should NOT have been called (low similarity skips it)
      expect(provider.complete).not.toHaveBeenCalled();
    });

    it('stores embedding blob on new insert', async () => {
      const service = new MemoryService(makeProvider());
      const [mem] = await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers quiet room', confidence: 0.9 },
      ]);

      expect(mem!.embedding).not.toBeNull();
      const buf = mem!.embedding as Buffer;
      const decoded = Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
      expect(decoded).toHaveLength(SIMILAR_VEC.length);
    });

    it('falls back to plain insert when embed throws', async () => {
      const provider = makeProvider({
        embed: vi.fn().mockRejectedValue(new Error('Embedding service down')),
      });
      const service = new MemoryService(provider);

      const [mem] = await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers quiet room', confidence: 0.9 },
      ]);

      expect(mem!.content).toBe('Prefers quiet room');
      expect(mem!.embedding).toBeNull();
      expect(provider.complete).not.toHaveBeenCalled();
    });

    it('classify defaults to DIFFERENT when AI call fails', async () => {
      const provider = makeProvider({
        complete: vi.fn().mockRejectedValue(new Error('AI down')),
      });
      const service = new MemoryService(provider);

      // Both facts get the same embedding → near-match found → classify called → fails → DIFFERENT → two rows
      await service.insert(guestId, null, [{ category: 'preference', content: 'Quiet room', confidence: 0.9 }]);
      await service.insert(guestId, null, [{ category: 'preference', content: 'Quiet room again', confidence: 0.9 }]);

      const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
      expect(stored).toHaveLength(2);
    });
  });

  describe('updateEmbedding', () => {
    it('stores embedding as binary float32 blob', async () => {
      const service = new MemoryService();
      const [mem] = await service.insert(guestId, null, [
        { category: 'preference', content: 'Prefers quiet room', confidence: 0.9 },
      ]);

      const vec = [0.1, 0.2, 0.3, 0.4];
      await service.updateEmbedding(mem!.id, vec);

      const updated = await service.getById(mem!.id);
      const buf = updated.embedding as Buffer;
      const decoded = Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
      expect(decoded[0]).toBeCloseTo(0.1);
      expect(decoded[3]).toBeCloseTo(0.4);
    });

    it('overwrites a previous embedding', async () => {
      const service = new MemoryService();
      const [mem] = await service.insert(guestId, null, [
        { category: 'habit', content: 'Early riser', confidence: 0.7 },
      ]);

      await service.updateEmbedding(mem!.id, [0.1, 0.2]);
      await service.updateEmbedding(mem!.id, [0.9, 0.8]);

      const updated = await service.getById(mem!.id);
      const buf = updated.embedding as Buffer;
      const decoded = Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
      expect(decoded[0]).toBeCloseTo(0.9);
    });
  });

  describe('listForGuest', () => {
    it('returns all memories for a guest', async () => {
      const service = new MemoryService();
      await service.insert(guestId, null, [
        { category: 'preference', content: 'Quiet room', confidence: 0.9 },
        { category: 'habit', content: 'Early riser', confidence: 0.7 },
      ]);
      expect(await service.listForGuest(guestId)).toHaveLength(2);
    });

    it('returns empty array when guest has no memories', async () => {
      expect(await new MemoryService().listForGuest(guestId)).toHaveLength(0);
    });

    it('does not return memories belonging to other guests', async () => {
      const otherId = generateId('guest');
      await db.insert(guests).values({ id: otherId, firstName: 'Other', lastName: 'Guest', createdAt: now(), updatedAt: now() });
      await new MemoryService().insert(otherId, null, [{ category: 'preference', content: 'Other guest preference', confidence: 1.0 }]);
      expect(await new MemoryService().listForGuest(guestId)).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('returns memory by id', async () => {
      const [inserted] = await new MemoryService().insert(guestId, null, [
        { category: 'complaint', content: 'Complained about noise', confidence: 1.0 },
      ]);
      const found = await new MemoryService().getById(inserted!.id);
      expect(found.content).toBe('Complained about noise');
    });

    it('throws NotFoundError for unknown id', async () => {
      await expect(new MemoryService().getById('non-existent-id')).rejects.toThrow();
    });
  });

  describe('recall', () => {
    it('returns empty array when guest has no memories', async () => {
      const results = await new MemoryService().recall(guestId);
      expect(results).toHaveLength(0);
    });

    it('never returns memories belonging to another guest', async () => {
      const otherId = generateId('guest');
      await db.insert(guests).values({ id: otherId, firstName: 'Other', lastName: 'Guest', createdAt: now(), updatedAt: now() });

      const service = new MemoryService();

      // Insert memories for the other guest and assign an embedding
      const [otherMem] = await service.insert(otherId, null, [
        { category: 'preference', content: 'Other guest preference', confidence: 1.0 },
      ]);
      await service.updateEmbedding(otherMem!.id, [1, 0, 0, 0]);

      // Query for our guest with the same vector — should return nothing
      const results = await service.recall(guestId, [1, 0, 0, 0]);
      expect(results).toHaveLength(0);
      expect(results.every((r) => r.guestId === guestId)).toBe(true);
    });

    it('recency fallback: returns top 5 most recently reinforced when no embedding given', async () => {
      const service = new MemoryService();
      // Insert 6 memories
      for (let i = 1; i <= 6; i++) {
        await service.insert(guestId, null, [
          { category: 'preference', content: `Preference ${i}`, confidence: 0.8 },
        ]);
      }
      const results = await service.recall(guestId);
      expect(results).toHaveLength(5);
    });

    it('semantic recall: ranks memories by cosine similarity', async () => {
      const service = new MemoryService();

      // Insert memories without embeddings, then assign known vectors
      const [memA] = await service.insert(guestId, null, [{ category: 'preference', content: 'Quiet room', confidence: 0.9 }]);
      const [memB] = await service.insert(guestId, null, [{ category: 'habit', content: 'Early riser', confidence: 0.8 }]);
      const [memC] = await service.insert(guestId, null, [{ category: 'personal', content: 'Travelling with dog', confidence: 1.0 }]);

      // Assign distinct orthogonal-ish vectors
      await service.updateEmbedding(memA!.id, [1, 0, 0, 0]);  // closest to query
      await service.updateEmbedding(memB!.id, [0, 1, 0, 0]);  // furthest from query
      await service.updateEmbedding(memC!.id, [0.9, 0.1, 0, 0]); // second closest

      // Query with vector close to memA
      const results = await service.recall(guestId, [1, 0, 0, 0]);

      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe(memA!.id);   // most similar
      expect(results[1]!.id).toBe(memC!.id);   // second
      expect(results[2]!.id).toBe(memB!.id);   // least similar
    });

    it('semantic recall: falls back to recency when no memories have embeddings', async () => {
      const service = new MemoryService();
      await service.insert(guestId, null, [
        { category: 'preference', content: 'Quiet room', confidence: 0.9 },
        { category: 'habit', content: 'Early riser', confidence: 0.8 },
      ]);
      // No updateEmbedding — all embeddings are null
      const results = await service.recall(guestId, [1, 0, 0, 0]);
      expect(results).toHaveLength(2); // recency fallback
    });

    it('semantic recall: respects topK', async () => {
      const service = new MemoryService();
      for (let i = 0; i < 4; i++) {
        const [mem] = await service.insert(guestId, null, [
          { category: 'preference', content: `Pref ${i}`, confidence: 0.9 },
        ]);
        await service.updateEmbedding(mem!.id, [1, i * 0.1, 0, 0]);
      }
      const results = await service.recall(guestId, [1, 0, 0, 0], 2);
      expect(results).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('deletes a memory', async () => {
      const service = new MemoryService();
      const [inserted] = await service.insert(guestId, null, [
        { category: 'request', content: 'Always requests extra towels', confidence: 0.8 },
      ]);
      await service.delete(inserted!.id);
      expect(await service.listForGuest(guestId)).toHaveLength(0);
    });

    it('throws NotFoundError when deleting non-existent memory', async () => {
      await expect(new MemoryService().delete('non-existent-id')).rejects.toThrow();
    });

    it('only deletes the targeted memory', async () => {
      const service = new MemoryService();
      const memories = await service.insert(guestId, null, [
        { category: 'preference', content: 'Quiet room', confidence: 0.9 },
        { category: 'habit', content: 'Early riser', confidence: 0.7 },
      ]);
      await service.delete(memories[0]!.id);
      const remaining = await service.listForGuest(guestId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.content).toBe('Early riser');
    });
  });
});
