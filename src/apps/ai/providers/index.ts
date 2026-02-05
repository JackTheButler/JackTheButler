/**
 * AI Providers
 *
 * Exports all AI provider extensions.
 *
 * @module extensions/ai/providers
 */

export {
  AnthropicProvider,
  createAnthropicProvider,
  manifest as anthropicManifest,
  type AnthropicConfig,
} from './anthropic.js';

export {
  OpenAIProvider,
  createOpenAIProvider,
  manifest as openaiManifest,
  type OpenAIConfig,
} from './openai.js';

export {
  OllamaProvider,
  createOllamaProvider,
  manifest as ollamaManifest,
  type OllamaConfig,
} from './ollama.js';

export {
  LocalAIProvider,
  createLocalProvider,
  manifest as localManifest,
  type LocalConfig,
} from './local.js';
