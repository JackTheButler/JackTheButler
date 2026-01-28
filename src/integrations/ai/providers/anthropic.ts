/**
 * Anthropic Claude Provider
 *
 * Claude API integration for the integrations layer.
 * This wraps the core Claude provider with connection testing.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse } from '@/ai/types.js';
import type { BaseProvider, ConnectionTestResult } from '@/integrations/core/types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('integrations:ai:anthropic');

/**
 * Default Claude model
 */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Anthropic provider configuration
 */
export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Anthropic Claude provider implementation
 */
export class AnthropicProvider implements LLMProvider, BaseProvider {
  readonly id = 'anthropic';
  readonly name = 'claude';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: AnthropicConfig) {
    if (!config.apiKey) {
      throw new Error('Anthropic provider requires API key');
    }

    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || 1024;

    log.info({ model: this.model }, 'Anthropic provider initialized');
  }

  /**
   * Test connection to Anthropic API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Send a minimal request to verify the API key works
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        message: 'Successfully connected to Anthropic API',
        details: {
          model: this.model,
          responseId: response.id,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'Anthropic connection test failed');

      return {
        success: false,
        message: `Connection failed: ${message}`,
        latencyMs,
      };
    }
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
      max_tokens: request.maxTokens || this.maxTokens,
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
   * This uses a simple hash-based approach for testing.
   * For production, use OpenAI or another embedding service.
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    log.warn('Claude does not support embeddings natively, using fallback');

    const embedding = this.createFallbackEmbedding(request.text);

    return {
      embedding,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  /**
   * Create a fallback embedding (for testing only)
   */
  private createFallbackEmbedding(text: string): number[] {
    const dimensions = 1536;
    const embedding = new Array(dimensions).fill(0);

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const idx = (i * 7 + charCode) % dimensions;
      embedding[idx] = (embedding[idx] + charCode / 255) % 1;
    }

    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }
}

/**
 * Create an Anthropic provider instance
 */
export function createAnthropicProvider(config: AnthropicConfig): AnthropicProvider {
  return new AnthropicProvider(config);
}
