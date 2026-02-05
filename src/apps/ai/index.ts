/**
 * AI Extensions
 *
 * Factory and exports for AI provider extensions.
 *
 * @module extensions/ai
 */

import type { AIProvider } from '@/core/interfaces/ai.js';
import type { AIAppManifest, BaseProvider, ConnectionTestResult } from '../types.js';

import {
  createAnthropicProvider,
  anthropicManifest,
  type AnthropicConfig,
} from './providers/index.js';
import {
  createOpenAIProvider,
  openaiManifest,
  type OpenAIConfig,
} from './providers/index.js';
import {
  createOllamaProvider,
  ollamaManifest,
  type OllamaConfig,
} from './providers/index.js';
import {
  createLocalProvider,
  localManifest,
  type LocalConfig,
} from './providers/index.js';

// Re-export providers
export {
  AnthropicProvider,
  createAnthropicProvider,
  type AnthropicConfig,
} from './providers/anthropic.js';
export { OpenAIProvider, createOpenAIProvider, type OpenAIConfig } from './providers/openai.js';
export { OllamaProvider, createOllamaProvider, type OllamaConfig } from './providers/ollama.js';
export { LocalAIProvider, createLocalProvider, type LocalConfig } from './providers/local.js';

/**
 * AI provider types
 */
export type AIProviderType = 'anthropic' | 'openai' | 'ollama' | 'local';

/**
 * Combined AI provider interface (AIProvider + connection testing)
 */
export interface CombinedAIProvider extends AIProvider, BaseProvider {}

/**
 * All registered AI extension manifests
 */
export const aiManifests: Record<AIProviderType, AIAppManifest> = {
  anthropic: anthropicManifest,
  openai: openaiManifest,
  ollama: ollamaManifest,
  local: localManifest,
};

/**
 * Get all AI extension manifests
 */
export function getAIManifests(): AIAppManifest[] {
  return Object.values(aiManifests);
}

/**
 * Get a specific AI extension manifest
 */
export function getAIManifest(type: AIProviderType): AIAppManifest | undefined {
  return aiManifests[type];
}

/**
 * Create an AI provider by type and config
 */
export function createAIProvider(
  type: AIProviderType,
  config: Record<string, unknown>
): CombinedAIProvider {
  switch (type) {
    case 'anthropic':
      return createAnthropicProvider(config as unknown as AnthropicConfig);
    case 'openai':
      return createOpenAIProvider(config as unknown as OpenAIConfig);
    case 'ollama':
      return createOllamaProvider(config as unknown as OllamaConfig);
    case 'local':
      return createLocalProvider(config as unknown as LocalConfig);
    default:
      throw new Error(`Unknown AI provider type: ${type}`);
  }
}

/**
 * Test connection to an AI provider
 */
export async function testAIProviderConnection(
  type: AIProviderType,
  config: Record<string, unknown>
): Promise<ConnectionTestResult> {
  try {
    const provider = createAIProvider(type, config);
    return await provider.testConnection();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to create provider: ${message}`,
    };
  }
}

