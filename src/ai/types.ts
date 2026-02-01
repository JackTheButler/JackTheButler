/**
 * AI Types
 *
 * Re-exports core AI provider interfaces and adds responder types.
 */

// Re-export all AI provider types from core interfaces
export type {
  MessageRole,
  CompletionMessage,
  CompletionRequest,
  CompletionResponse,
  TokenUsage,
  EmbeddingRequest,
  EmbeddingResponse,
  AIProvider,
  AIProviderConfig,
  AIProviderType,
  // Backward compatibility aliases
  LLMProvider,
  ProviderConfig,
  ProviderType,
} from '@/core/interfaces/ai.js';

// ===================
// Responder Types
// ===================

import type { Conversation } from '@/db/schema.js';
import type { InboundMessage } from '@/types/message.js';
import type { GuestContext } from '@/services/guest-context.js';

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
   * Generate a response for a message
   * @param conversation - The conversation context
   * @param message - The inbound message to respond to
   * @param guestContext - Optional guest context with profile and reservation info
   */
  generate(
    conversation: Conversation,
    message: InboundMessage,
    guestContext?: GuestContext
  ): Promise<Response>;
}
