/**
 * OpenAI Provider Extension
 *
 * OpenAI API integration for AI completions and embeddings.
 *
 * @module extensions/ai/providers/openai
 */

import OpenAI from 'openai';
import type {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from '@/core/interfaces/ai.js';
import type { AIAppManifest, BaseProvider, ConnectionTestResult } from '../../types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('extensions:ai:openai');

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
export class OpenAIProvider implements AIProvider, BaseProvider {
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

    log.info(
      { model: this.model, embeddingModel: this.embeddingModel },
      'OpenAI provider initialized'
    );
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

/**
 * Extension manifest for OpenAI
 */
export const manifest: AIAppManifest = {
  id: 'openai',
  name: 'OpenAI',
  category: 'ai',
  version: '1.0.0',
  description: 'GPT models by OpenAI - versatile AI with excellent embeddings',
  icon: '🧠',
  docsUrl: 'https://platform.openai.com/docs',
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      description: 'Your OpenAI API key',
      placeholder: 'sk-...',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'select',
      required: false,
      description: 'GPT model to use for completions',
      default: DEFAULT_MODEL,
      options: [
        { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster)' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      ],
    },
    {
      key: 'embeddingModel',
      label: 'Embedding Model',
      type: 'select',
      required: false,
      description: 'Model to use for embeddings',
      default: DEFAULT_EMBEDDING_MODEL,
      options: [
        { value: 'text-embedding-3-small', label: 'text-embedding-3-small (Recommended)' },
        { value: 'text-embedding-3-large', label: 'text-embedding-3-large (Higher Quality)' },
        { value: 'text-embedding-ada-002', label: 'text-embedding-ada-002 (Legacy)' },
      ],
    },
    {
      key: 'maxTokens',
      label: 'Max Tokens',
      type: 'number',
      required: false,
      description: 'Maximum tokens in response',
      default: 1024,
    },
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      required: false,
      description: 'Custom API base URL (for proxies)',
      placeholder: 'https://api.openai.com/v1',
    },
  ],
  capabilities: {
    completion: true,
    embedding: true,
    streaming: true,
  },
  createProvider: (config) => createOpenAIProvider(config as unknown as OpenAIConfig),
};
