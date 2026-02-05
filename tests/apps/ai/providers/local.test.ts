/**
 * Local AI Provider Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock embedding output - 384 dimensions for all-MiniLM-L6-v2
const mockEmbeddingData = new Float32Array(384).fill(0.1);

// Mock the transformers module (v3)
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async (task: string) => {
    if (task === 'feature-extraction') {
      // Return an embedding function
      return async () => ({ data: mockEmbeddingData });
    } else if (task === 'text-generation') {
      // Return a generation function that mimics Llama 3.2 output format
      return async (prompt: string) => [
        {
          generated_text: prompt + 'Hi there! How can I help you today?',
        },
      ];
    }
    throw new Error(`Unknown task: ${task}`);
  }),
}));

// Import after mock
import { LocalAIProvider, createLocalProvider, manifest } from '@/apps/ai/providers/local.js';

describe('LocalAIProvider', () => {
  describe('constructor', () => {
    it('should create provider with default config', () => {
      const provider = new LocalAIProvider();
      expect(provider.id).toBe('local');
      expect(provider.name).toBe('local');
    });

    it('should create provider with custom config', () => {
      const customProvider = new LocalAIProvider({
        embeddingModel: 'custom/embedding-model',
        completionModel: 'custom/completion-model',
      });

      expect(customProvider.id).toBe('local');
      expect(customProvider.name).toBe('local');
    });
  });

  describe('embed', () => {
    it('should generate embeddings', async () => {
      const provider = new LocalAIProvider();
      const result = await provider.embed({ text: 'Hello world' });

      expect(result.embedding).toBeDefined();
      expect(Array.isArray(result.embedding)).toBe(true);
      expect(result.embedding.length).toBe(384); // MiniLM-L6-v2 dimensions
      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    });

    it('should return consistent embedding structure', async () => {
      const provider = new LocalAIProvider();
      const result1 = await provider.embed({ text: 'First text' });
      const result2 = await provider.embed({ text: 'Second text' });

      expect(result1.embedding.length).toBe(result2.embedding.length);
    });
  });

  describe('complete', () => {
    it('should generate completion', async () => {
      const provider = new LocalAIProvider();
      const result = await provider.complete({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
      expect(result.stopReason).toBe('end_turn');
    });

    it('should handle messages with different roles', async () => {
      const provider = new LocalAIProvider();
      const result = await provider.complete({
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'How are you?' },
        ],
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('testConnection', () => {
    it('should test connection successfully', async () => {
      const provider = new LocalAIProvider();
      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Local AI provider is ready');
      expect(result.details).toBeDefined();
      expect(result.latencyMs).toBeDefined();
      expect(typeof result.latencyMs).toBe('number');
    });
  });
});

describe('createLocalProvider', () => {
  it('should create a LocalAIProvider instance', () => {
    const provider = createLocalProvider();
    expect(provider).toBeInstanceOf(LocalAIProvider);
  });

  it('should pass config to provider', () => {
    const provider = createLocalProvider({
      embeddingModel: 'custom/model',
    });
    expect(provider).toBeInstanceOf(LocalAIProvider);
  });
});

describe('Local AI Manifest', () => {
  it('should have correct structure', () => {
    expect(manifest.id).toBe('local');
    expect(manifest.name).toBe('Local AI (Built-in)');
    expect(manifest.category).toBe('ai');
    expect(manifest.version).toBe('2.0.0');
  });

  it('should declare correct capabilities', () => {
    expect(manifest.capabilities.completion).toBe(true);
    expect(manifest.capabilities.embedding).toBe(true);
    expect(manifest.capabilities.streaming).toBe(false);
  });

  it('should have config schema', () => {
    expect(Array.isArray(manifest.configSchema)).toBe(true);
    expect(manifest.configSchema.length).toBe(2);

    const embeddingField = manifest.configSchema.find((f) => f.key === 'embeddingModel');
    expect(embeddingField).toBeDefined();
    expect(embeddingField?.required).toBe(false);

    const completionField = manifest.configSchema.find((f) => f.key === 'completionModel');
    expect(completionField).toBeDefined();
    expect(completionField?.required).toBe(false);
  });

  it('should create provider via factory', () => {
    const provider = manifest.createProvider({});
    expect(provider).toBeInstanceOf(LocalAIProvider);
  });
});
