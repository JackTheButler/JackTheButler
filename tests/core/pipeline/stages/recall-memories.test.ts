/**
 * recallMemories stage tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recallMemories } from '@/core/pipeline/stages/recall-memories.js';
import { computeEmbedding } from '@/core/pipeline/stages/compute-embedding.js';
import { searchKnowledge } from '@/core/pipeline/stages/search-knowledge.js';
import { createContext } from '@/core/pipeline/context.js';
import type { InboundMessage } from '@/types/index.js';
import type { GuestMemory } from '@/db/schema.js';
import type { GuestContext } from '@/core/conversation/guest-context.js';

vi.mock('@/services/memory.js', () => ({
  memoryService: {
    recall: vi.fn(),
  },
}));

vi.mock('@/apps/index.js', () => ({
  getAppRegistry: vi.fn(),
}));

vi.mock('@/ai/knowledge/index.js', () => ({
  KnowledgeService: vi.fn().mockImplementation(() => ({
    searchByEmbedding: vi.fn().mockResolvedValue([]),
  })),
}));

const testInbound: InboundMessage = {
  id: 'msg-001',
  channel: 'webchat',
  channelId: 'session-001',
  content: 'Can I get extra pillows?',
  contentType: 'text',
  timestamp: new Date(),
};

const mockMemory: GuestMemory = {
  id: 'mem-001',
  guestId: 'gst-001',
  conversationId: 'conv-001',
  category: 'preference',
  content: 'Prefers feather-free pillows',
  source: 'ai_extracted',
  confidence: 0.95,
  embedding: null,
  createdAt: new Date().toISOString(),
  lastReinforcedAt: new Date().toISOString(),
};

function makeGuestContext(guestId: string): GuestContext {
  return {
    guest: {
      id: guestId,
      firstName: 'Test',
      lastName: 'Guest',
      fullName: 'Test Guest',
      email: null,
      phone: null,
      language: 'en',
      loyaltyTier: null,
      vipStatus: null,
      preferences: [],
    },
    reservation: null,
  };
}

describe('recallMemories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('populates ctx.memories using ctx.queryEmbedding (webchat guest via guestContext)', async () => {
    const { memoryService } = await import('@/services/memory.js');
    vi.mocked(memoryService.recall).mockResolvedValue([mockMemory]);

    const ctx = createContext(testInbound);
    ctx.guestContext = makeGuestContext('gst-001');
    ctx.queryEmbedding = [0.1, 0.2, 0.3, 0.4];

    await recallMemories(ctx);

    expect(memoryService.recall).toHaveBeenCalledWith('gst-001', [0.1, 0.2, 0.3, 0.4]);
    expect(ctx.memories).toHaveLength(1);
    expect(ctx.memories?.[0]!.content).toBe('Prefers feather-free pillows');
  });

  it('passes undefined embedding for recency fallback when queryEmbedding not set', async () => {
    const { memoryService } = await import('@/services/memory.js');
    vi.mocked(memoryService.recall).mockResolvedValue([mockMemory]);

    const ctx = createContext(testInbound);
    ctx.guestContext = makeGuestContext('gst-001');
    // no queryEmbedding

    await recallMemories(ctx);

    expect(memoryService.recall).toHaveBeenCalledWith('gst-001', undefined);
  });

  it('skips when no guestContext is set', async () => {
    const { memoryService } = await import('@/services/memory.js');

    const ctx = createContext(testInbound);
    ctx.queryEmbedding = [0.1, 0.2];
    // no ctx.guestContext

    await recallMemories(ctx);

    expect(memoryService.recall).not.toHaveBeenCalled();
    expect(ctx.memories).toBeUndefined();
  });

  it('skips when guestContext has no guest (anonymous conversation)', async () => {
    const { memoryService } = await import('@/services/memory.js');

    const ctx = createContext(testInbound);
    ctx.guestContext = { guest: null, reservation: null };
    ctx.queryEmbedding = [0.1, 0.2];

    await recallMemories(ctx);

    expect(memoryService.recall).not.toHaveBeenCalled();
    expect(ctx.memories).toBeUndefined();
  });

  it('sets ctx.memories to empty array when guest has no memories', async () => {
    const { memoryService } = await import('@/services/memory.js');
    vi.mocked(memoryService.recall).mockResolvedValue([]);

    const ctx = createContext(testInbound);
    ctx.guestContext = makeGuestContext('gst-001');
    ctx.queryEmbedding = [0.1, 0.2];

    await recallMemories(ctx);

    expect(ctx.memories).toEqual([]);
  });

  it('warns and continues without memories when recall throws', async () => {
    const { memoryService } = await import('@/services/memory.js');
    vi.mocked(memoryService.recall).mockRejectedValue(new Error('DB error'));

    const ctx = createContext(testInbound);
    ctx.guestContext = makeGuestContext('gst-001');
    ctx.queryEmbedding = [0.1, 0.2];

    // Should not throw
    await expect(recallMemories(ctx)).resolves.toBeUndefined();
    expect(ctx.memories).toBeUndefined();
  });
});

describe('embedding provider called exactly once across pipeline stages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('embed is called once when computeEmbedding, searchKnowledge, and recallMemories run together', async () => {
    const { getAppRegistry } = await import('@/apps/index.js');
    const { memoryService } = await import('@/services/memory.js');

    const embedSpy = vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3, 0.4] });
    vi.mocked(getAppRegistry).mockReturnValue({
      getEmbeddingProvider: () => ({ embed: embedSpy }),
    } as ReturnType<typeof getAppRegistry>);
    vi.mocked(memoryService.recall).mockResolvedValue([]);

    const ctx = createContext(testInbound);
    ctx.guestContext = makeGuestContext('gst-001');

    await computeEmbedding(ctx);
    await searchKnowledge(ctx);
    await recallMemories(ctx);

    expect(embedSpy).toHaveBeenCalledTimes(1);
    expect(ctx.queryEmbedding).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(ctx.knowledgeResults).toBeDefined();
    expect(ctx.memories).toBeDefined();
  });
});
