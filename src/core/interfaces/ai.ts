/**
 * AI Provider Interface
 *
 * Defines the contract all AI/LLM providers must implement.
 * This is part of the kernel - business logic depends on this interface,
 * not on concrete implementations (Claude, OpenAI, Ollama).
 *
 * @module core/interfaces/ai
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
  /** Which model tier to use. Defaults to 'completion'. */
  modelTier?: ModelTier | undefined;
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
 * AI Provider interface
 *
 * Abstraction for different AI providers (Claude, OpenAI, Ollama).
 * All AI providers must implement this interface.
 */
export interface AIProvider {
  /**
   * Provider name (e.g., 'claude', 'openai', 'ollama')
   */
  readonly name: string;

  /**
   * Generate a completion from the model.
   * Pass modelTier: 'utility' for lightweight tasks (translation, classification).
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
export interface AIProviderConfig {
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
export type AIProviderType = 'claude' | 'openai' | 'ollama';

// Backward compatibility alias
export type LLMProvider = AIProvider;
export type ProviderConfig = AIProviderConfig;
export type ProviderType = AIProviderType;
