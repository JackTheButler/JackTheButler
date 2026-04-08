/**
 * AI provider interface and types.
 *
 * Plugin authors implement AIProvider using these types.
 *
 * @module shared/ai
 */

/**
 * Message role in a conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * A message in a completion request
 */
export interface CompletionMessage {
  role: MessageRole;
  content: string;
}

/**
 * Model tier for completion requests.
 * - 'completion': Primary model for generating guest responses (default)
 * - 'utility': Smaller/faster model for translation, classification, and search queries
 */
export type ModelTier = 'completion' | 'utility';

/**
 * Request to generate a completion
 */
export interface CompletionRequest {
  messages: CompletionMessage[];
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  stopSequences?: string[] | undefined;
  modelTier?: ModelTier | undefined;
  purpose?: string | undefined;
  onComplete?: (content: string) => Record<string, unknown>;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Response from a completion request
 */
export interface CompletionResponse {
  content: string;
  usage: TokenUsage;
  stopReason?: string | undefined;
}

/**
 * Embedding request
 */
export interface EmbeddingRequest {
  text: string;
  purpose?: string;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  embedding: number[];
  usage?: TokenUsage | undefined;
}

/**
 * AI Provider interface — implement this to build an AI provider plugin.
 */
export interface AIProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
