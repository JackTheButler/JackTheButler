/**
 * Registry-dependent provider adapters for @thebutler/pipeline.
 *
 * These adapters bind `@thebutler/pipeline`'s provider contracts to
 * Butler's app registry — the piece of the pipeline wiring that needs
 * `@/apps`. Composition-root concern, not domain logic, so it lives here
 * in `src/pipeline/` (assembly layer) rather than `src/core/pipeline/`
 * (domain layer). See `src/core/pipeline/adapters.ts` for the
 * registry-free adapters (conversation, knowledge, memory, prompts).
 *
 * @module pipeline/adapters
 */

import type { AIProvider } from '@thebutler/pipeline';
import { getAppRegistry } from '@/apps/index.js';

// Routes `complete` to the user-configured active AI provider and `embed`
// to whichever provider is currently embedding-capable (Butler's registry
// can return a different provider for embeddings — e.g. local fallback).
// Maps the package's `modelTier: 'reasoning'` onto Butler's `'completion'`.
// `name` is a getter so System Health logs see the active provider's id.
export const aiProvider: AIProvider = {
  get name() {
    return getAppRegistry().getActiveAIProvider()?.name ?? 'unknown';
  },

  complete: async (request) => {
    const provider = getAppRegistry().getActiveAIProvider();
    if (!provider) throw new Error('No active AI provider configured');

    const butlerTier =
      request.modelTier === 'reasoning' ? 'completion' : request.modelTier;

    const response = await provider.complete({
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
      ...(butlerTier !== undefined ? { modelTier: butlerTier } : {}),
      ...(request.purpose !== undefined ? { purpose: request.purpose } : {}),
      // The package's `logFields` maps directly onto Butler's existing
      // plugin-level `onComplete` hook — same signature, different name.
      // The plugin merges the returned fields into the app_log row.
      ...(request.logFields !== undefined
        ? { onComplete: request.logFields }
        : {}),
    });

    return {
      content: response.content,
      ...(response.usage
        ? {
            usage: {
              inputTokens: response.usage.inputTokens,
              outputTokens: response.usage.outputTokens,
            },
          }
        : {}),
    };
  },

  embed: async (request) => {
    const provider = getAppRegistry().getEmbeddingProvider();
    if (!provider) throw new Error('No embedding provider configured');

    const response = await provider.embed({ text: request.text });

    return {
      embedding: response.embedding,
      ...(response.usage
        ? { usage: { inputTokens: response.usage.inputTokens } }
        : {}),
    };
  },
};
