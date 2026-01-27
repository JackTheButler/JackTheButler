/**
 * AI Provider Types
 *
 * Interfaces for LLM providers (Claude, OpenAI, Ollama).
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
 * Request to generate a completion
 */
export interface CompletionRequest {
  messages: CompletionMessage[];
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  stopSequences?: string[] | undefined;
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
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  embedding: number[];
  usage?: TokenUsage | undefined;
}

/**
 * LLM Provider interface
 *
 * Abstraction for different AI providers (Claude, OpenAI, Ollama).
 */
export interface LLMProvider {
  /**
   * Provider name
   */
  readonly name: string;

  /**
   * Generate a completion from the model
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Generate embeddings for text
   */
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  model?: string | undefined;
  embeddingModel?: string | undefined;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
}

/**
 * Available provider types
 */
export type ProviderType = 'claude' | 'openai' | 'ollama';
