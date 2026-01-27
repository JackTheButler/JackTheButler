/**
 * Intent Classification Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentClassifier } from '@/ai/intent/index.js';
import { IntentTaxonomy, getIntentDefinition, getIntentNames } from '@/ai/intent/taxonomy.js';
import type { LLMProvider, CompletionResponse } from '@/ai/types.js';

/**
 * Create a mock LLM provider
 */
function createMockProvider(response: string): LLMProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      content: response,
      usage: { inputTokens: 10, outputTokens: 5 },
    } as CompletionResponse),
    embed: vi.fn().mockResolvedValue({
      embedding: new Array(1536).fill(0.1),
      usage: { inputTokens: 5, outputTokens: 0 },
    }),
  };
}

describe('Intent Taxonomy', () => {
  it('should have required intents defined', () => {
    const intentNames = getIntentNames();

    expect(intentNames).toContain('request.housekeeping.towels');
    expect(intentNames).toContain('inquiry.checkout');
    expect(intentNames).toContain('greeting');
    expect(intentNames).toContain('unknown');
  });

  it('should return intent definition', () => {
    const definition = getIntentDefinition('inquiry.checkout');

    expect(definition).toBeDefined();
    expect(definition?.department).toBe('front_desk');
    expect(definition?.requiresAction).toBe(false);
  });

  it('should return undefined for unknown intent', () => {
    const definition = getIntentDefinition('nonexistent.intent');
    expect(definition).toBeUndefined();
  });

  it('should have examples for each intent', () => {
    for (const [name, def] of Object.entries(IntentTaxonomy)) {
      if (name !== 'unknown') {
        expect(def.examples.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('classify', () => {
    it('should classify checkout inquiry', async () => {
      const mockResponse = JSON.stringify({
        intent: 'inquiry.checkout',
        confidence: 0.95,
        reasoning: 'Guest is asking about checkout time',
      });

      const provider = createMockProvider(mockResponse);
      classifier = new IntentClassifier(provider);

      const result = await classifier.classify('What time is checkout?');

      expect(result.intent).toBe('inquiry.checkout');
      expect(result.confidence).toBe(0.95);
      expect(result.department).toBe('front_desk');
      expect(result.requiresAction).toBe(false);
    });

    it('should classify housekeeping request', async () => {
      const mockResponse = JSON.stringify({
        intent: 'request.housekeeping.towels',
        confidence: 0.92,
        reasoning: 'Guest needs towels',
      });

      const provider = createMockProvider(mockResponse);
      classifier = new IntentClassifier(provider);

      const result = await classifier.classify('I need more towels please');

      expect(result.intent).toBe('request.housekeeping.towels');
      expect(result.department).toBe('housekeeping');
      expect(result.requiresAction).toBe(true);
    });

    it('should handle greeting', async () => {
      const mockResponse = JSON.stringify({
        intent: 'greeting',
        confidence: 0.99,
        reasoning: 'Simple greeting',
      });

      const provider = createMockProvider(mockResponse);
      classifier = new IntentClassifier(provider);

      const result = await classifier.classify('Hello');

      expect(result.intent).toBe('greeting');
      expect(result.department).toBeNull();
    });

    it('should cap confidence at 1.0', async () => {
      const mockResponse = JSON.stringify({
        intent: 'greeting',
        confidence: 1.5, // Invalid high value
      });

      const provider = createMockProvider(mockResponse);
      classifier = new IntentClassifier(provider);

      const result = await classifier.classify('Hi');

      expect(result.confidence).toBe(1.0);
    });

    it('should handle malformed JSON response', async () => {
      const provider = createMockProvider('Not valid JSON');
      classifier = new IntentClassifier(provider);

      const result = await classifier.classify('Test message');

      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should handle provider error', async () => {
      const provider = createMockProvider('');
      provider.complete = vi.fn().mockRejectedValue(new Error('API Error'));

      classifier = new IntentClassifier(provider);

      const result = await classifier.classify('Test message');

      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should extract JSON from response with extra text', async () => {
      const mockResponse = 'Here is the classification: {"intent":"greeting","confidence":0.9}';

      const provider = createMockProvider(mockResponse);
      classifier = new IntentClassifier(provider);

      const result = await classifier.classify('Hi there');

      expect(result.intent).toBe('greeting');
      expect(result.confidence).toBe(0.9);
    });
  });
});
