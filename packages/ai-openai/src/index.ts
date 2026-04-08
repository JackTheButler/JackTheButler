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
  AIAppManifest,
  AppLogger,
  BaseProvider,
  CompletionRequest,
  CompletionResponse,
  ConnectionTestResult,
  EmbeddingRequest,
  EmbeddingResponse,
  PluginContext,
} from '@jack/shared';
import { withLogContext } from '@jack/shared';

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
  utilityModel?: string;
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
  private utilityModel: string;
  private embeddingModel: string;
  private maxTokens: number;
  readonly appLog: AppLogger;

  constructor(config: OpenAIConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.apiKey) {
      throw new Error('OpenAI provider requires API key');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model || DEFAULT_MODEL;
    this.utilityModel = config.utilityModel || this.model;
    this.embeddingModel = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
    this.maxTokens = config.maxTokens || 1024;

    console.info(`OpenAI provider initialized: model=${this.model} utilityModel=${this.utilityModel} embeddingModel=${this.embeddingModel}`);
  }

  /**
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // List models to verify the API key works
      const models = await this.appLog('connection_test', {}, async () => {
        const result = await this.client.models.list();
        return withLogContext(result, { modelCount: result.data.length });
      });
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
      console.error('OpenAI connection test failed', error);

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
    const model = request.modelTier === 'utility' ? this.utilityModel : this.model;

    const createParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
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

    const eventType = request.purpose ? `completion.${request.purpose}` : 'completion';
    const response = await this.appLog(eventType, { model, ...(request.purpose && { purpose: request.purpose }) }, async () => {
      const result = await this.client.chat.completions.create(createParams);
      const text = result.choices[0]?.message?.content || '';
      const onCompleteContext = request.onComplete?.(text) ?? {};
      return withLogContext(result, {
        messageId: result.id,
        inputTokens: result.usage?.prompt_tokens,
        outputTokens: result.usage?.completion_tokens,
        finishReason: result.choices[0]?.finish_reason,
        ...onCompleteContext,
      });
    });

    const content = response.choices[0]?.message?.content || '';
    const usage = response.usage;

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
    const response = await this.appLog('embedding', { model: this.embeddingModel }, async () => {
      const result = await this.client.embeddings.create({ model: this.embeddingModel, input: request.text });
      return withLogContext(result, {
        inputTokens: result.usage?.prompt_tokens,
        dimensions: result.data[0]?.embedding.length,
      });
    });

    const embedding = response.data[0]?.embedding || [];

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
export function createOpenAIProvider(config: OpenAIConfig, context: PluginContext): OpenAIProvider {
  return new OpenAIProvider(config, context);
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
      label: 'Completion Model',
      type: 'select',
      required: false,
      description: 'Primary model for generating guest responses and conversations',
      default: DEFAULT_MODEL,
      options: [
        { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster)' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      ],
    },
    {
      key: 'utilityModel',
      label: 'Utility Model',
      type: 'select',
      required: false,
      description: 'Smaller model for translation, classification, and search queries. Falls back to completion model if not set.',
      default: 'gpt-4o-mini',
      options: [
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Recommended)' },
        { value: 'gpt-4o', label: 'GPT-4o' },
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
  createProvider: (config, context) => createOpenAIProvider(config as unknown as OpenAIConfig, context),
};

export default { manifest };
