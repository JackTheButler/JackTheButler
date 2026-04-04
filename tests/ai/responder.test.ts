/**
 * AIResponder Tests
 *
 * Key contract for Stage 3: when knowledgeResults are pre-computed and passed in,
 * the responder must use them directly and skip its internal knowledge search
 * (i.e. must not call the embedding provider again).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock conversation service so responder doesn't hit the DB for history
vi.mock('@/services/conversation.js', () => ({
  ConversationService: vi.fn().mockImplementation(() => ({
    getMessages: vi.fn().mockResolvedValue([]),
  })),
  conversationService: {
    getMessages: vi.fn().mockResolvedValue([]),
  },
}));

import { AIResponder } from '@/ai/responder.js';
import type { LLMProvider } from '@/ai/types.js';
import type { Conversation } from '@/db/schema.js';
import type { InboundMessage } from '@/types/message.js';
import type { KnowledgeSearchResult } from '@/ai/knowledge/index.js';

function createMockProvider(): LLMProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      content: 'How can I help you today?',
      usage: { inputTokens: 10, outputTokens: 8 },
    }),
    embed: vi.fn().mockResolvedValue({
      embedding: new Array(1536).fill(0.1),
      usage: { inputTokens: 5, outputTokens: 0 },
    }),
  };
}

const testConversation: Conversation = {
  id: 'conv-test-001',
  channel: 'webchat',
  channelId: 'session-001',
  state: 'active',
  guestId: null,
  guestLanguage: 'en',
  lastMessageAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolvedAt: null,
  metadata: null,
};

const testInbound: InboundMessage = {
  id: 'msg-test-001',
  channel: 'webchat',
  channelId: 'session-001',
  content: 'What time is checkout?',
  contentType: 'text',
  timestamp: new Date(),
};

describe('AIResponder', () => {
  let provider: LLMProvider;
  let responder: AIResponder;

  beforeEach(() => {
    provider = createMockProvider();
    responder = new AIResponder({ provider, enableCache: false });
  });

  describe('generate (without pre-computed knowledge)', () => {
    it('should call the embedding provider to search knowledge', async () => {
      await responder.generate(testConversation, testInbound);
      expect(provider.embed).toHaveBeenCalled();
    });

    it('should return a response with content and intent', async () => {
      const result = await responder.generate(testConversation, testInbound);
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generate (with pre-computed knowledgeResults)', () => {
    const precomputedResults: KnowledgeSearchResult[] = [
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

    it('should NOT call the embedding provider when knowledgeResults are provided', async () => {
      await responder.generate(testConversation, testInbound, undefined, precomputedResults);
      expect(provider.embed).not.toHaveBeenCalled();
    });

    it('should use the provided knowledge results in the response', async () => {
      const result = await responder.generate(testConversation, testInbound, undefined, precomputedResults);
      expect(result.content).toBeDefined();
      // Knowledge context should be reflected in metadata
      const knowledgeContext = result.metadata?.knowledgeContext as Array<{ id: string }> | undefined;
      expect(knowledgeContext).toBeDefined();
      expect(knowledgeContext?.[0]?.id).toBe('kb-001');
    });
  });
});
