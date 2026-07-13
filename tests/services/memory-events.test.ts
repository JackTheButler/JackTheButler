/**
 * Memory Event Subscriber Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/db/index.js';
import { guests, conversations, messages, guestMemories } from '@/db/schema.js';
import { eq } from 'drizzle-orm';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import { runExtraction, type MemoryEventSubscriberDeps } from '@/services/memory-events.js';
import type { ConversationClosedEvent } from '@/types/events.js';

const MOCK_FACTS = JSON.stringify([
  { category: 'preference', content: 'Prefers a quiet room', confidence: 0.9 },
]);

function makeMockProvider(completionResponse = MOCK_FACTS) {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({ content: completionResponse, usage: { inputTokens: 10, outputTokens: 20 } }),
    embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3, 0.4], usage: { inputTokens: 5, outputTokens: 0 } }),
  };
}

// Injected in place of `getAppRegistry()` — event-subscriber.ts no longer
// imports the app registry directly (src/core/** must not import @/apps).
// Each getter is a thunk, matching the composition root's wiring in
// src/index.ts, so tests can swap the returned provider per call if needed.
function makeDeps(
  provider: ReturnType<typeof makeMockProvider> | undefined,
  embeddingProvider: ReturnType<typeof makeMockProvider> | undefined = provider,
): MemoryEventSubscriberDeps {
  return {
    getActiveAIProvider: () => provider as never,
    getEmbeddingProvider: () => embeddingProvider as never,
  };
}

function makeClosedEvent(conversationId: string, guestId: string | null): ConversationClosedEvent {
  return {
    type: 'conversation.closed',
    conversationId,
    guestId,
    reason: 'timeout',
    timestamp: new Date(),
  };
}

describe('runExtraction', () => {
  let guestId: string;
  let conversationId: string;

  beforeEach(async () => {
    vi.resetAllMocks();

    guestId = generateId('guest');
    conversationId = generateId('conversation');

    await db.insert(guests).values({
      id: guestId,
      firstName: 'Memory',
      lastName: 'Subscriber',
      createdAt: now(),
      updatedAt: now(),
    });

    await db.insert(conversations).values({
      id: conversationId,
      guestId,
      channelType: 'webchat',
      channelId: `session_${guestId}`,
      state: 'closed',
      metadata: '{}',
      createdAt: now(),
      updatedAt: now(),
    });

    await db.delete(guestMemories).where(eq(guestMemories.guestId, guestId));
  });

  async function insertMessages(pairs: Array<{ guest: string; ai: string }>) {
    for (const pair of pairs) {
      await db.insert(messages).values({
        id: generateId('message'),
        conversationId,
        direction: 'inbound',
        senderType: 'guest',
        content: pair.guest,
        contentType: 'text',
        createdAt: now(),
      });
      await db.insert(messages).values({
        id: generateId('message'),
        conversationId,
        direction: 'outbound',
        senderType: 'ai',
        content: pair.ai,
        contentType: 'text',
        createdAt: now(),
      });
    }
  }

  it('inserts memories with embeddings when extraction succeeds', async () => {
    await insertMessages([
      { guest: 'I prefer a quiet room away from the elevator', ai: 'Noted!' },
      { guest: 'Also feather-free pillows please', ai: 'Absolutely, flagged for housekeeping.' },
    ]);

    const mockProvider = makeMockProvider();

    await runExtraction(makeClosedEvent(conversationId, guestId), makeDeps(mockProvider));

    const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.content).toBe('Prefers a quiet room');
    expect(stored[0]!.conversationId).toBe(conversationId);

    // Embedding is generated inside insert() — verify it is stored
    expect(stored[0]!.embedding).not.toBeNull();
    const buf = stored[0]!.embedding as Buffer;
    const decoded = Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
    expect(decoded).toHaveLength(4);
    expect(decoded[0]).toBeCloseTo(0.1);
  });

  it('skips when guestId is null', async () => {
    const mockProvider = makeMockProvider();

    await runExtraction(makeClosedEvent(conversationId, null), makeDeps(mockProvider));

    expect(mockProvider.complete).not.toHaveBeenCalled();
    const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
    expect(stored).toHaveLength(0);
  });

  it('skips when no AI provider is configured', async () => {
    await insertMessages([
      { guest: 'I prefer quiet rooms', ai: 'Noted!' },
      { guest: 'Also feather-free pillows', ai: 'Flagged!' },
    ]);

    await runExtraction(makeClosedEvent(conversationId, guestId), makeDeps(undefined));

    const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
    expect(stored).toHaveLength(0);
  });

  it('skips when fewer than 2 guest messages', async () => {
    await insertMessages([{ guest: 'Hi', ai: 'Hey, how can I help?' }]);

    const mockProvider = makeMockProvider();

    await runExtraction(makeClosedEvent(conversationId, guestId), makeDeps(mockProvider));

    expect(mockProvider.complete).not.toHaveBeenCalled();
  });

  it('inserts nothing when extractor returns empty array', async () => {
    await insertMessages([
      { guest: 'Can I get towels?', ai: 'On the way!' },
      { guest: 'Thanks!', ai: 'Of course!' },
    ]);

    const mockProvider = makeMockProvider('[]');

    await runExtraction(makeClosedEvent(conversationId, guestId), makeDeps(mockProvider));

    const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
    expect(stored).toHaveLength(0);
  });

  it('stores facts without embedding when embed fails', async () => {
    await insertMessages([
      { guest: 'I prefer a quiet room away from the elevator', ai: 'Noted!' },
      { guest: 'Also feather-free pillows please', ai: 'Absolutely, flagged for housekeeping.' },
    ]);

    const provider = makeMockProvider();
    provider.embed.mockRejectedValue(new Error('Embedding service unavailable'));

    await runExtraction(makeClosedEvent(conversationId, guestId), makeDeps(provider));

    const stored = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.content).toBe('Prefers a quiet room');
    expect(stored[0]!.embedding).toBeNull();
  });
});
