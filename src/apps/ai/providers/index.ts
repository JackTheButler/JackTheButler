/**
 * AI Providers
 *
 * anthropic, openai, and ollama have been extracted to workspace packages
 * under packages/. This file now only exports the local provider which
 * stays in src/ due to its heavy @xenova/transformers dependency.
 *
 * @module extensions/ai/providers
 */

export {
  LocalAIProvider,
  createLocalProvider,
  manifest as localManifest,
  type LocalConfig,
} from './local.js';
