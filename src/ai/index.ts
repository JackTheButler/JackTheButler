/**
 * AI Engine
 *
 * Handles AI-powered message processing:
 * - Intent classification
 * - Response generation
 * - Knowledge base retrieval (RAG)
 * - Guest memory and context
 *
 * @see docs/03-architecture/c4-components/ai-engine.md
 */

export * from './types.js';
export * from './providers/index.js';
export { KnowledgeService } from './knowledge/index.js';
export { IntentClassifier, IntentTaxonomy, getIntentDefinition } from './intent/index.js';
export { AIResponder, type AIResponderConfig } from './responder.js';
