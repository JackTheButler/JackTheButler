/**
 * searchKnowledge stage tests
 */

import { describe, it, expect, vi } from 'vitest';
import { searchKnowledge } from '@/core/pipeline/stages/search-knowledge.js';
import { createContext } from '@/core/pipeline/context.js';
import type { InboundMessage } from '@/types/index.js';
import type { KnowledgeSearchResult } from '@/ai/knowledge/index.js';

const testInbound: InboundMessage = {
  id: 'msg-001',
  channel: 'webchat',
  channelId: 'session-001',
  content: 'What time is checkout?',
  contentType: 'text',
  timestamp: new Date(),
};

const mockResults: KnowledgeSearchResult[] = [
  {
    id: 'kb-001',
    category: 'faq',
    title: 'Checkout Time',
    content: 'Checkout is at 11am.',
    keywords: null,
    priority: 0,
    status: 'active',
    similarity: 0.92,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

vi.mock('@/ai/knowledge/index.js', () => ({
  KnowledgeService: vi.fn().mockImplementation(() => ({
    searchByEmbedding: vi.fn().mockResolvedValue([
      {
        id: 'kb-001',
        category: 'faq',
        title: 'Checkout Time',
        content: 'Checkout is at 11am.',
        keywords: null,
        priority: 0,
        status: 'active',
        similarity: 0.92,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]),
  })),
}));

describe('searchKnowledge', () => {
  it('sets ctx.knowledgeResults when queryEmbedding is available', async () => {
    const ctx = createContext(testInbound);
    ctx.queryEmbedding = new Array(1536).fill(0.1);

    await searchKnowledge(ctx);

    expect(ctx.knowledgeResults).toHaveLength(1);
    expect(ctx.knowledgeResults?.[0]).toMatchObject({ id: 'kb-001', similarity: 0.92 });
  });

  it('skips gracefully when ctx.queryEmbedding is not set', async () => {
    const ctx = createContext(testInbound);
    // no queryEmbedding

    await searchKnowledge(ctx);

    expect(ctx.knowledgeResults).toBeUndefined();
  });

  it('leaves ctx.knowledgeResults undefined when queryEmbedding is missing', async () => {
    const ctx = createContext(testInbound);
    // no queryEmbedding set
    await searchKnowledge(ctx);
    expect(ctx.knowledgeResults).toBeUndefined();
  });
});
