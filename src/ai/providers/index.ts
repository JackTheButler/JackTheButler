/**
 * AI Provider Factory
 *
 * Creates and manages AI providers based on configuration.
 */

import type { LLMProvider, ProviderType, ProviderConfig } from '../types.js';
import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('ai:providers');

export { ClaudeProvider } from './claude.js';
export { OpenAIProvider } from './openai.js';
export { OllamaProvider } from './ollama.js';

/**
 * Cached provider instance
 */
let cachedProvider: LLMProvider | null = null;

/**
 * Cached embedding provider (may be different from main provider)
 */
let cachedEmbeddingProvider: LLMProvider | null = null;

/**
 * Create a provider instance
 */
export function createProvider(type: ProviderType, config: ProviderConfig): LLMProvider {
  switch (type) {
    case 'claude':
      return new ClaudeProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Get the configured AI provider
 *
 * Uses the provider specified in config, falls back to available providers.
 */
export function getProvider(): LLMProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const config = loadConfig();
  const aiConfig = config.ai;

  // Try configured provider first
  const providerType = aiConfig.provider;

  const providerConfig: ProviderConfig = {
    model: aiConfig.model,
    embeddingModel: aiConfig.embeddingModel,
    maxTokens: aiConfig.maxTokens,
    temperature: aiConfig.temperature,
  };

  try {
    switch (providerType) {
      case 'claude':
        if (aiConfig.anthropicApiKey) {
          providerConfig.apiKey = aiConfig.anthropicApiKey;
          cachedProvider = new ClaudeProvider(providerConfig);
          log.info('Using Claude as AI provider');
          return cachedProvider;
        }
        break;

      case 'openai':
        if (aiConfig.openaiApiKey) {
          providerConfig.apiKey = aiConfig.openaiApiKey;
          cachedProvider = new OpenAIProvider(providerConfig);
          log.info('Using OpenAI as AI provider');
          return cachedProvider;
        }
        break;

      case 'ollama':
        providerConfig.baseUrl = aiConfig.ollamaBaseUrl;
        cachedProvider = new OllamaProvider(providerConfig);
        log.info('Using Ollama as AI provider');
        return cachedProvider;
    }

    // Fallback chain: Claude -> OpenAI -> Ollama
    if (aiConfig.anthropicApiKey) {
      providerConfig.apiKey = aiConfig.anthropicApiKey;
      cachedProvider = new ClaudeProvider(providerConfig);
      log.info('Falling back to Claude as AI provider');
      return cachedProvider;
    }

    if (aiConfig.openaiApiKey) {
      providerConfig.apiKey = aiConfig.openaiApiKey;
      cachedProvider = new OpenAIProvider(providerConfig);
      log.info('Falling back to OpenAI as AI provider');
      return cachedProvider;
    }

    // Default to Ollama (local)
    providerConfig.baseUrl = aiConfig.ollamaBaseUrl;
    cachedProvider = new OllamaProvider(providerConfig);
    log.info('Falling back to Ollama as AI provider');
    return cachedProvider;
  } catch (error) {
    log.error({ error }, 'Failed to create AI provider');
    throw error;
  }
}

/**
 * Get an embedding provider
 *
 * Prefers OpenAI for embeddings since Claude doesn't have native embedding support.
 * Falls back to Claude's simple hash-based embeddings for testing.
 */
export function getEmbeddingProvider(): LLMProvider {
  if (cachedEmbeddingProvider) {
    return cachedEmbeddingProvider;
  }

  const config = loadConfig();
  const aiConfig = config.ai;

  const providerConfig: ProviderConfig = {
    embeddingModel: aiConfig.embeddingModel,
  };

  // Prefer OpenAI for embeddings (best quality)
  if (aiConfig.openaiApiKey) {
    providerConfig.apiKey = aiConfig.openaiApiKey;
    cachedEmbeddingProvider = new OpenAIProvider(providerConfig);
    log.info('Using OpenAI for embeddings');
    return cachedEmbeddingProvider;
  }

  // Use Claude's fallback embeddings (simple but works without external service)
  if (aiConfig.anthropicApiKey) {
    providerConfig.apiKey = aiConfig.anthropicApiKey;
    cachedEmbeddingProvider = new ClaudeProvider(providerConfig);
    log.info('Using Claude fallback for embeddings');
    return cachedEmbeddingProvider;
  }

  // Fallback to Ollama (requires local Ollama server)
  providerConfig.baseUrl = aiConfig.ollamaBaseUrl;
  cachedEmbeddingProvider = new OllamaProvider(providerConfig);
  log.info('Using Ollama for embeddings');
  return cachedEmbeddingProvider;
}

/**
 * Reset cached providers (for testing)
 */
export function resetProviders(): void {
  cachedProvider = null;
  cachedEmbeddingProvider = null;
}
