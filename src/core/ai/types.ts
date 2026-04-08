/**
 * AI Types
 *
 * Re-exports core AI provider interfaces and adds responder types.
 */

export type {
  MessageRole,
  CompletionMessage,
  CompletionRequest,
  CompletionResponse,
  ModelTier,
  TokenUsage,
  EmbeddingRequest,
  EmbeddingResponse,
  AIProvider,
} from '@jack/shared';

/** Internal server config for AI providers — not part of the plugin contract */
export interface AIProviderConfig {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  model?: string | undefined;
  embeddingModel?: string | undefined;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
}

/** AI provider types supported by the server */
export type AIProviderType = 'claude' | 'openai' | 'ollama';

// Backward compatibility aliases
export type { AIProvider as LLMProvider } from '@jack/shared';
export type { AIProviderConfig as ProviderConfig };
export type { AIProviderType as ProviderType };

// ===================
// Responder Types
// ===================

import type { Conversation, GuestMemory } from '@/db/schema.js';
import type { InboundMessage } from '@/types/message.js';
import type { GuestContext } from '@/core/conversation/guest-context.js';
import type { KnowledgeSearchResult } from './knowledge/index.js';
import type { ClassificationResult } from './intent/index.js';

/**
 * Response from the responder
 */
export interface Response {
  content: string;
  confidence: number;
  intent?: string | undefined;
  entities?: unknown[] | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Responder interface
 */
export interface Responder {
  /**
   * Generate a response for a message.
   * @param conversation - The conversation context
   * @param message - The inbound message to respond to
   * @param guestContext - Optional guest context with profile and reservation info
   * @param knowledgeResults - Pre-computed knowledge search results from the pipeline.
   *   When provided, the responder uses them directly and skips its internal knowledge search.
   * @param memories - Pre-recalled guest memories from the pipeline.
   *   When provided, injected into the system prompt after the guest profile block.
   */
  generate(
    conversation: Conversation,
    message: InboundMessage,
    guestContext?: GuestContext,
    knowledgeResults?: KnowledgeSearchResult[],
    memories?: GuestMemory[],
    classification?: ClassificationResult
  ): Promise<Response>;
}
