/**
 * OpenAI Provider
 *
 * OpenAI API integration for completions and embeddings.
 */

import OpenAI from 'openai';
import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderConfig,
} from '../types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('ai:openai');

/**
 * Default OpenAI models
 */
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;
  private embeddingModel: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI provider requires OPENAI_API_KEY');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model || DEFAULT_MODEL;
    this.embeddingModel = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;

    log.info({ model: this.model, embeddingModel: this.embeddingModel }, 'OpenAI provider initialized');
  }

  /**
   * Generate a completion using OpenAI
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    log.debug({ messageCount: request.messages.length }, 'Sending completion request');

    const createParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: request.maxTokens || 1024,
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
