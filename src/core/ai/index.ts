/**
 * AI module — shared types and the knowledge service.
 *
 * Historically this module also exposed a responder factory + intent
 * classifier + response cache, all of which lived inside the legacy
 * `pipeline-legacy/`. Those have been retired; the pipeline package
 * owns responder/classifier/translation, and FAQ caching is deferred
 * to a future Butler-side stage.
 *
 * @module ai
 */

// AIProvider / CompletionRequest / EmbeddingRequest / etc. re-exports
export * from './types.js';

// Knowledge service is still used directly by `src/core/pipeline/adapters.ts`
// (the `knowledgeProvider` adapter wraps `KnowledgeService.searchByEmbedding`).
export { KnowledgeService } from './knowledge/index.js';

// Escalation lives one level up; surfaced here for backwards-compat consumers
// that imported from `@/core/ai`.
export {
  EscalationManager,
  getEscalationManager,
  resetEscalationManager,
  type EscalationDecision,
  type EscalationConfig,
} from '@/core/conversation/escalation.js';
