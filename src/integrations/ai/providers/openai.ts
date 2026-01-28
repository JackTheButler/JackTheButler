/**
 * OpenAI Provider
 *
 * OpenAI API integration for the integrations layer.
 * This wraps the core OpenAI provider with connection testing.
 */

import OpenAI from 'openai';
import type { LLMProvider, CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse } from '@/ai/types.js';
import type { BaseProvider, ConnectionTestResult } from '@/integrations/core/types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('integrations:ai:openai');

/**
 * Default OpenAI models
 */
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * OpenAI provider configuration
 */
export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  embeddingModel?: string;
  maxTokens?: number;
  baseUrl?: string;
}

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider implements LLMProvider, BaseProvider {
  readonly id = 'openai';
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;
  private embeddingModel: string;
  private maxTokens: number;

  constructor(config: OpenAIConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI provider requires API key');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model || DEFAULT_MODEL;
    this.embeddingModel = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
    this.maxTokens = config.maxTokens || 1024;

    log.info({ model: this.model, embeddingModel: this.embeddingModel }, 'OpenAI provider initialized');
  }

  /**
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // List models to verify the API key works
      const models = await this.client.models.list();
      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        message: 'Successfully connected to OpenAI API',
        details: {
          model: this.model,
          availableModels: models.data.slice(0, 5).map((m) => m.id),
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'OpenAI connection test failed');

      return {
        success: false,
        message: `Connection failed: ${message}`,
        latencyMs,
      };
    }
  }

  /**
   * Generate a completion using OpenAI
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    log.debug({ messageCount: request.messages.length }, 'Sending completion request');

    const createParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: request.maxTokens || this.maxTokens,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (request.temperature !== undefined) {
      createParams.temperature = request.temperature;
    }
    if (request.stopSequences && request.stopSequences.length > 0) {
      createParams.stop = request.stopSequences;
    }

    const response = await this.client.chat.completions.create(createParams);

    const content = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    log.debug(
      {
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        finishReason: response.choices[0]?.finish_reason,
      },
      'Completion response received'
    );

    return {
      content,
      usage: {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
      },
      stopReason: response.choices[0]?.finish_reason ?? undefined,
    };
  }

  /**
   * Generate embeddings using OpenAI
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    log.debug({ textLength: request.text.length }, 'Generating embedding');

    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: request.text,
    });

    const embedding = response.data[0]?.embedding || [];

    log.debug(
      {
        dimensions: embedding.length,
        tokens: response.usage?.total_tokens,
      },
      'Embedding generated'
    );

    return {
      embedding,
      usage: {
        inputTokens: response.usage?.total_tokens || 0,
        outputTokens: 0,
      },
    };
  }
}

/**
 * Create an OpenAI provider instance
 */
export function createOpenAIProvider(config: OpenAIConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}
