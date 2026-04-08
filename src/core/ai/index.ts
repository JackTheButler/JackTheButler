/**
 * AI Engine
 *
 * Handles AI-powered message processing:
 * - Intent classification
 * - Response generation (AI or Echo)
 * - Knowledge base retrieval (RAG)
 * - Response caching
 *
 * @module ai
 */

import type { Conversation, GuestMemory } from '@/db/schema.js';
import type { InboundMessage } from '@/types/message.js';
import type { GuestContext } from '@/core/conversation/guest-context.js';
import type { KnowledgeSearchResult } from './knowledge/index.js';
import type { ClassificationResult } from './intent/index.js';
import type { Response, Responder } from './types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('ai');

// ===================
// Type Exports
// ===================

export * from './types.js';

// ===================
// Component Exports
// ===================

export { KnowledgeService } from './knowledge/index.js';
export { IntentClassifier, IntentDefinitions, getIntentDefinition } from './intent/index.js';
export { AIResponder, type AIResponderConfig } from './responder.js';
export { EchoResponder } from './echo-responder.js';
export { ResponseCacheService, getResponseCache, type CacheConfig, type CachedResponse } from './cache.js';

// Escalation is in core/ - export directly from there
export {
  EscalationManager,
  getEscalationManager,
  resetEscalationManager,
  type EscalationDecision,
  type EscalationConfig,
} from '@/core/conversation/escalation.js';

// ===================
// Responder Factory
// ===================

/**
 * Cached responder instance
 */
let cachedResponder: Responder | null = null;
let isInitializing = false;
let initPromise: Promise<Responder> | null = null;

/**
 * Initialize the AI responder asynchronously
 * Uses extension registry to get active AI provider (configured via dashboard UI)
 */
async function initializeAIResponder(): Promise<Responder | null> {
  try {
    // Dynamic import to avoid circular dependency issues
    const appsModule = await import('@/apps/index.js');
    const { AIResponder } = await import('./responder.js');

    const registry = appsModule.getAppRegistry();
    const provider = registry.getActiveAIProvider();

    if (!provider) {
      log.debug('No active AI provider in extension registry');
      return null;
    }

    // Get embedding provider — may differ from completion provider
    const embeddingProvider = registry.getEmbeddingProvider() ?? provider;

    const responder = new AIResponder({
      provider,
      embeddingProvider,
    });

    log.info({ provider: provider.name }, 'Using AI responder');
    return responder;
  } catch (error) {
    const err = error as Error;
    log.warn(
      { err: { message: err.message, stack: err.stack, name: err.name } },
      'Failed to initialize AI responder, falling back to echo'
    );
    return null;
  }
}

/**
 * Get the responder (async initialization)
 */
async function getResponderAsync(): Promise<Responder> {
  if (cachedResponder) {
    return cachedResponder;
  }

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    const aiResponder = await initializeAIResponder();

    if (aiResponder) {
      cachedResponder = aiResponder;
      return aiResponder;
    }

    // Fallback to echo responder
    log.info('Using echo responder (no AI provider configured)');
    const { EchoResponder } = await import('./echo-responder.js');
    const echoResponder = new EchoResponder();
    cachedResponder = echoResponder;
    return echoResponder;
  })();

  return initPromise;
}

/**
 * Get the default responder (sync version, may return echo if not initialized)
 */
export function getResponder(): Responder {
  if (cachedResponder) {
    return cachedResponder;
  }

  // Start async initialization
  getResponderAsync();

  // Return a wrapper that waits for initialization
  return {
    async generate(
      conversation: Conversation,
      message: InboundMessage,
      guestContext?: GuestContext,
      knowledgeResults?: KnowledgeSearchResult[],
      memories?: GuestMemory[],
      classification?: ClassificationResult,
      verificationState?: import('@/services/verification.js').VerificationState
    ): Promise<Response> {
      const responder = await getResponderAsync();
      return responder.generate(conversation, message, guestContext, knowledgeResults, memories, classification, verificationState);
    },
  };
}

/**
 * Reset cached responder (call when AI provider config changes)
 */
export function resetResponder(): void {
  cachedResponder = null;
  isInitializing = false;
  initPromise = null;
}

/**
 * Default responder instance (lazy loaded)
 */
export const defaultResponder: Responder = {
  generate(
    conversation: Conversation,
    message: InboundMessage,
    guestContext?: GuestContext,
    knowledgeResults?: KnowledgeSearchResult[],
    memories?: GuestMemory[],
    classification?: ClassificationResult,
    verificationState?: import('@/services/verification.js').VerificationState
  ): Promise<Response> {
    return getResponder().generate(conversation, message, guestContext, knowledgeResults, memories, classification, verificationState);
  },
};
