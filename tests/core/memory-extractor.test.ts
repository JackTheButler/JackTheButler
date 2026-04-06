/**
 * Memory Extractor Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { MemoryExtractor } from '@/core/memory/extractor.js';
import type { LLMProvider } from '@/core/ai/types.js';
import type { Message } from '@/db/schema.js';

// Minimal Message factory — only fields the extractor uses
function makeMessage(senderType: 'guest' | 'ai' | 'staff' | 'system', content: string): Message {
  return {
    id: `msg_${Math.random()}`,
    conversationId: 'conv_test',
    direction: senderType === 'guest' ? 'inbound' : 'outbound',
    senderType,
    senderId: null,
    content,
    contentType: 'text',
    media: null,
    intent: null,
    confidence: null,
    entities: null,
    channelMessageId: null,
    deliveryStatus: 'sent',
    deliveryError: null,
    detectedLanguage: 'en',
    translatedContent: null,
    createdAt: new Date().toISOString(),
  };
}

function makeProvider(responseContent: string): LLMProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({ content: responseContent, usage: { inputTokens: 10, outputTokens: 20 } }),
    embed: vi.fn(),
  };
}

const SAMPLE_TRANSCRIPT = [
  makeMessage('guest', 'Hi, can I get a quiet room away from the elevator?'),
  makeMessage('ai', 'Of course! I\'ve noted that preference for your stay.'),
  makeMessage('guest', 'Also I\'m allergic to feather pillows, please make sure housekeeping knows.'),
  makeMessage('ai', 'Absolutely, I\'ll flag that with housekeeping right away.'),
  makeMessage('guest', 'And can you send up some extra towels now?'),
  makeMessage('ai', 'Sending them up now!'),
];

describe('MemoryExtractor', () => {
  describe('extract', () => {
    it('should return typed MemoryFact array from a valid AI response', async () => {
      const aiResponse = JSON.stringify([
        { category: 'preference', content: 'Prefers a quiet room away from the elevator', confidence: 0.95 },
        { category: 'personal', content: 'Allergic to feather pillows', confidence: 1.0 },
      ]);

      const extractor = new MemoryExtractor(makeProvider(aiResponse));
      const facts = await extractor.extract(SAMPLE_TRANSCRIPT);

      expect(facts).toHaveLength(2);
      expect(facts[0]!.category).toBe('preference');
      expect(facts[0]!.content).toBe('Prefers a quiet room away from the elevator');
      expect(facts[0]!.confidence).toBe(0.95);
      expect(facts[1]!.category).toBe('personal');
    });

    it('should strip markdown code fences from AI response', async () => {
      const aiResponse = '```json\n[{"category":"habit","content":"Always requests extra towels","confidence":0.8}]\n```';

      const extractor = new MemoryExtractor(makeProvider(aiResponse));
      const facts = await extractor.extract(SAMPLE_TRANSCRIPT);

      expect(facts).toHaveLength(1);
      expect(facts[0]!.category).toBe('habit');
    });

    it('should return empty array when AI returns empty array', async () => {
      const extractor = new MemoryExtractor(makeProvider('[]'));
      const facts = await extractor.extract(SAMPLE_TRANSCRIPT);

      expect(facts).toHaveLength(0);
    });

    it('should return empty array for empty message list', async () => {
      const extractor = new MemoryExtractor(makeProvider('[]'));
      const facts = await extractor.extract([]);

      expect(facts).toHaveLength(0);
    });

    it('should skip system messages when building transcript', async () => {
      const provider = makeProvider('[]');
      const extractor = new MemoryExtractor(provider);

      const messages = [
        makeMessage('system', 'Conversation started'),
        makeMessage('guest', 'Hello'),
        makeMessage('ai', 'Hi there!'),
      ];

      await extractor.extract(messages);

      const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const userMessage = call.messages[1].content as string;

      expect(userMessage).toContain('Guest: Hello');
      expect(userMessage).toContain('Jack: Hi there!');
      expect(userMessage).not.toContain('system');
      expect(userMessage).not.toContain('Conversation started');
    });

    it('should use translatedContent over content when available', async () => {
      const provider = makeProvider('[]');
      const extractor = new MemoryExtractor(provider);

      const msg = makeMessage('guest', 'Necesito una habitación tranquila');
      msg.translatedContent = 'I need a quiet room';

      await extractor.extract([msg]);

      const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const userMessage = call.messages[1].content as string;

      expect(userMessage).toContain('I need a quiet room');
      expect(userMessage).not.toContain('Necesito');
    });

    it('should return empty array and not throw when AI returns invalid JSON', async () => {
      const extractor = new MemoryExtractor(makeProvider('not valid json at all'));
      const facts = await extractor.extract(SAMPLE_TRANSCRIPT);

      expect(facts).toHaveLength(0);
    });

    it('should filter out facts with invalid structure', async () => {
      const aiResponse = JSON.stringify([
        { category: 'preference', content: 'Valid fact', confidence: 0.9 },
        { category: 'unknown_category', content: 'Invalid category', confidence: 0.8 },
        { category: 'habit', content: '', confidence: 0.7 }, // empty content
        { category: 'personal', confidence: 0.6 }, // missing content
      ]);

      const extractor = new MemoryExtractor(makeProvider(aiResponse));
      const facts = await extractor.extract(SAMPLE_TRANSCRIPT);

      expect(facts).toHaveLength(1);
      expect(facts[0]!.content).toBe('Valid fact');
    });

    it('should use utility model tier', async () => {
      const provider = makeProvider('[]');
      const extractor = new MemoryExtractor(provider);

      await extractor.extract(SAMPLE_TRANSCRIPT);

      const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.modelTier).toBe('utility');
    });

    it('should accept conversationId for log context without affecting output', async () => {
      const aiResponse = JSON.stringify([
        { category: 'preference', content: 'Prefers quiet room', confidence: 0.9 },
      ]);
      const extractor = new MemoryExtractor(makeProvider(aiResponse));

      const facts = await extractor.extract(SAMPLE_TRANSCRIPT, 'conv_abc123');

      expect(facts).toHaveLength(1);
    });

    it('prompt should allow food allergies and dietary info to be extracted', async () => {
      const provider = makeProvider('[]');
      const extractor = new MemoryExtractor(provider);

      await extractor.extract(SAMPLE_TRANSCRIPT);

      const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const systemPrompt = call.messages[0].content as string;

      expect(systemPrompt).toMatch(/allerg/i);
      expect(systemPrompt).not.toMatch(/health conditions/i);
    });
  });
});
