/**
 * AI Extensions
 *
 * Local AI provider (stays in src/ due to @xenova/transformers dependency).
 * All other AI providers are workspace packages discovered via node_modules/@jackthebutler/.
 *
 * @module extensions/ai
 */

export { LocalAIProvider, createLocalProvider, manifest as localManifest, type LocalConfig } from './providers/local.js';
