/**
 * computeEmbedding stage tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeEmbedding } from '@/core/pipeline/stages/compute-embedding.js';
import { createContext } from '@/core/pipeline/context.js';
import type { InboundMessage } from '@/types/index.js';

const testInbound: InboundMessage = {
  id: 'msg-001',
  channel: 'webchat',
  channelId: 'session-001',
  content: 'What time is checkout?',
  contentType: 'text',
  timestamp: new Date(),
};

const mockEmbedding = new Array(1536).fill(0.1);

vi.mock('@/apps/index.js', () => ({
  getAppRegistry: vi.fn(),
}));

describe('computeEmbedding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sets ctx.queryEmbedding when embedding provider is available', async () => {
    const { getAppRegistry } = await import('@/apps/index.js');
    vi.mocked(getAppRegistry).mockReturnValue({
      getEmbeddingProvider: () => ({
        name: 'mock',
        embed: vi.fn().mockResolvedValue({ embedding: mockEmbedding }),
        complete: vi.fn(),
      }),
    } as never);

    const ctx = createContext(testInbound);
    await computeEmbedding(ctx);

    expect(ctx.queryEmbedding).toEqual(mockEmbedding);
  });

  it('skips gracefully when no embedding provider is configured', async () => {
    const { getAppRegistry } = await import('@/apps/index.js');
    vi.mocked(getAppRegistry).mockReturnValue({
      getEmbeddingProvider: () => undefined,
    } as never);

    const ctx = createContext(testInbound);
    await computeEmbedding(ctx);

    expect(ctx.queryEmbedding).toBeUndefined();
  });

  it('uses translatedContent over raw content when available', async () => {
    const embedFn = vi.fn().mockResolvedValue({ embedding: mockEmbedding });
    const { getAppRegistry } = await import('@/apps/index.js');
    vi.mocked(getAppRegistry).mockReturnValue({
      getEmbeddingProvider: () => ({ name: 'mock', embed: embedFn, complete: vi.fn() }),
    } as never);

    const ctx = createContext(testInbound);
    ctx.translatedContent = 'What time is checkout? (translated)';
    await computeEmbedding(ctx);

    expect(embedFn).toHaveBeenCalledWith({ text: 'What time is checkout? (translated)' });
  });

  it('skips gracefully when embedding provider throws', async () => {
    const { getAppRegistry } = await import('@/apps/index.js');
    vi.mocked(getAppRegistry).mockReturnValue({
      getEmbeddingProvider: () => ({
        name: 'mock',
        embed: vi.fn().mockRejectedValue(new Error('provider down')),
        complete: vi.fn(),
      }),
    } as never);

    const ctx = createContext(testInbound);
    await expect(computeEmbedding(ctx)).resolves.toBeUndefined();
    expect(ctx.queryEmbedding).toBeUndefined();
  });
});
