/**
 * AI Provider Factory
 *
 * Re-exports from the integrations layer for backward compatibility.
 * New code should import directly from '@/integrations/ai'.
 *
 * @deprecated Import from '@/integrations/ai' instead
 */

import type { LLMProvider, ProviderType, ProviderConfig } from '../types.js';
import {
  getAIProvider,
  getEmbeddingProvider,
  resetAIProviders,
  createAIProvider,
  type AIProviderType,
} from '@/integrations/ai/index.js';

// Re-export provider classes with old names
export { AnthropicProvider as ClaudeProvider } from '@/integrations/ai/index.js';
export { OpenAIProvider } from '@/integrations/ai/index.js';
export { OllamaProvider } from '@/integrations/ai/index.js';

/**
 * Cached provider instance
 */
let cachedProvider: LLMProvider | null = null;

/**
 * Create a provider instance
 *
 * @deprecated Use createAIProvider from '@/integrations/ai' instead
 */
export function createProvider(type: ProviderType, config: ProviderConfig): LLMProvider {
  // Map old type names to new
  const typeMap: Record<ProviderType, AIProviderType> = {
    claude: 'anthropic',
    openai: 'openai',
    ollama: 'ollama',
  };

  return createAIProvider(typeMap[type], {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    embeddingModel: config.embeddingModel,
    maxTokens: config.maxTokens,
  });
}

/**
 * Get the configured AI provider
 *
 * @deprecated Use getAIProvider from '@/integrations/ai' instead
 */
export function getProvider(): LLMProvider {
  if (cachedProvider) {
    return cachedProvider;
  }
  cachedProvider = getAIProvider();
  return cachedProvider;
}

/**
 * Get an embedding provider
 *
 * @deprecated Use getEmbeddingProvider from '@/integrations/ai' instead
 */
export { getEmbeddingProvider };

/**
 * Reset cached providers (for testing)
 */
export function resetProviders(): void {
  cachedProvider = null;
  resetAIProviders();
}
