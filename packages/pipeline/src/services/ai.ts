/**
 * AIProvider — LLM completion and embedding.
 *
 * The single backend for everything LLM in the pipeline: classifier,
 * responder, language detector, translator (all via `complete`), plus
 * knowledge search and memory recall ranking (via `embed`).
 *
 * Consumer implements this against their preferred provider — Anthropic,
 * OpenAI, Bedrock, Ollama, etc. — and passes the adapter to `createPipeline`.
 *
 * @module services/ai
 */

import type {
  AICompletionRequest,
  AICompletionResult,
  AIEmbeddingRequest,
  AIEmbeddingResult,
} from '../types/ai.js';

export interface AIProvider {
  /** Human-readable provider identifier (e.g. `'anthropic'`, `'openai'`). */
  readonly name: string;

  complete(request: AICompletionRequest): Promise<AICompletionResult>;
  embed(request: AIEmbeddingRequest): Promise<AIEmbeddingResult>;
}
