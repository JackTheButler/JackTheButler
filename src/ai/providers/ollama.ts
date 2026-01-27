/**
 * Ollama Provider
 *
 * Local LLM support via Ollama for privacy-sensitive deployments.
 */

import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderConfig,
} from '../types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('ai:ollama');

/**
 * Default Ollama models
 */
const DEFAULT_MODEL = 'llama3.1';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';
const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Ollama API response types
 */
interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Ollama provider implementation
 */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;
    this.embeddingModel = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;

    log.info(
      { baseUrl: this.baseUrl, model: this.model, embeddingModel: this.embeddingModel },
      'Ollama provider initialized'
    );
  }

  /**
   * Generate a completion using Ollama
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const conversationMessages = request.messages.filter((m) => m.role !== 'system');

    // Build prompt in Ollama format
    let prompt = '';
    if (systemMessage) {
      prompt += `### System\n${systemMessage.content}\n\n`;
    }

    for (const msg of conversationMessages) {
      if (msg.role === 'user') {
        prompt += `### User\n${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        prompt += `### Assistant\n${msg.content}\n\n`;
      }
    }
    prompt += '### Assistant\n';

    log.debug({ promptLength: prompt.length }, 'Sending completion request');

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          num_predict: request.maxTokens || 1024,
          temperature: request.temperature || 0.7,
          stop: request.stopSequences,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaGenerateResponse;

    log.debug(
      {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      },
      'Completion response received'
    );

    return {
      content: data.response.trim(),
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
      },
      stopReason: data.done ? 'end_turn' : undefined,
    };
  }

  /**
   * Generate embeddings using Ollama
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    log.debug({ textLength: request.text.length }, 'Generating embedding');

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.embeddingModel,
        prompt: request.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;

    log.debug({ dimensions: data.embedding.length }, 'Embedding generated');

    return {
      embedding: data.embedding,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
