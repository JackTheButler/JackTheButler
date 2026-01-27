/**
 * Claude AI Provider
 *
 * Anthropic Claude API integration.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderConfig,
} from '../types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('ai:claude');

/**
 * Default Claude model
 */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Claude provider implementation
 */
export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  private client: Anthropic;
  private model: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('Claude provider requires ANTHROPIC_API_KEY');
    }

    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODEL;

    log.info({ model: this.model }, 'Claude provider initialized');
  }

  /**
   * Generate a completion using Claude
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    log.debug(
      { messageCount: otherMessages.length, hasSystem: !!systemMessage },
      'Sending completion request'
    );

    const createParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: request.maxTokens || 1024,
      messages: otherMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    };

    if (request.temperature !== undefined) {
      createParams.temperature = request.temperature;
    }
    if (systemMessage?.content) {
      createParams.system = systemMessage.content;
    }
    if (request.stopSequences && request.stopSequences.length > 0) {
      createParams.stop_sequences = request.stopSequences;
    }

    const response = await this.client.messages.create(createParams);

    const textContent = response.content.find((c) => c.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    log.debug(
      {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason,
      },
      'Completion response received'
    );

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      stopReason: response.stop_reason ?? undefined,
    };
  }

  /**
   * Generate embeddings
   *
   * Note: Claude doesn't have a native embedding API.
   * This uses OpenAI's embedding API as a fallback.
   * For production, consider using a dedicated embedding service.
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // Claude doesn't have embeddings, so we use a simple hash-based approach for now
    // In production, this would use OpenAI or another embedding service
    log.warn('Claude does not support embeddings natively, using fallback');

    // Simple fallback: create a pseudo-embedding based on text hash
    // This is NOT suitable for production - just for testing the pipeline
    const embedding = this.createFallbackEmbedding(request.text);

    return {
      embedding,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  /**
   * Create a fallback embedding (for testing only)
   * In production, use OpenAI or another embedding service
   */
  private createFallbackEmbedding(text: string): number[] {
    const dimensions = 1536;
    const embedding = new Array(dimensions).fill(0);

    // Simple hash-based embedding (NOT for production)
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const idx = (i * 7 + charCode) % dimensions;
      embedding[idx] = (embedding[idx] + charCode / 255) % 1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }
}
