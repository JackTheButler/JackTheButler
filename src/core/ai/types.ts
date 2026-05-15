/**
 * AI Types
 *
 * Re-exports the public AI provider contract from `@jackthebutler/shared`
 * (used by plugins) plus a small `AIProviderConfig` shape Butler uses
 * internally for stored provider settings.
 *
 * The legacy `Responder` / `Response` interfaces previously here have
 * been retired along with the legacy pipeline; the new pipeline owns its
 * own response shape inside `@jackthebutler/pipeline`.
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
} from '@jackthebutler/shared';

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
export type { AIProvider as LLMProvider } from '@jackthebutler/shared';
export type { AIProviderConfig as ProviderConfig };
export type { AIProviderType as ProviderType };
