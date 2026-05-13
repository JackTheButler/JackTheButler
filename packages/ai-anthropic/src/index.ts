/**
 * Anthropic Claude Provider Extension
 *
 * Claude API integration for AI completions.
 *
 * @module extensions/ai/providers/anthropic
 */

import Anthropic from '@anthropic-ai/sdk';
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
} from '@jackthebutler/shared';
import { withLogContext } from '@jackthebutler/shared';

/**
 * Default Claude model
 */
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Anthropic provider configuration
 */
export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  utilityModel?: string;
  maxTokens?: number;
}

/**
 * Anthropic Claude provider implementation
 */
export class AnthropicProvider implements AIProvider, BaseProvider {
  readonly id = 'anthropic';
  readonly name = 'claude';
  private client: Anthropic;
  private model: string;
  private utilityModel: string;
  private maxTokens: number;
  readonly appLog: AppLogger;

  constructor(config: AnthropicConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.apiKey) {
      throw new Error('Anthropic provider requires API key');
    }

    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODEL;
    this.utilityModel = config.utilityModel || this.model;
    this.maxTokens = config.maxTokens || 1024;
  }

  /**
   * Test connection to Anthropic API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Send a minimal request to verify the API key works
      const response = await this.appLog('connection_test', { model: this.model }, async () => {
        const result = await this.client.messages.create({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
        return withLogContext(result, {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
        });
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
    const model = request.modelTier === 'utility' ? this.utilityModel : this.model;
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const createParams: Anthropic.MessageCreateParamsNonStreaming = {
      model,
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

    const eventType = request.purpose ? `completion.${request.purpose}` : 'completion';
    const response = await this.appLog(eventType, { model, ...(request.purpose && { purpose: request.purpose }) }, async () => {
      const result = await this.client.messages.create(createParams);
      const textBlock = result.content.find((c) => c.type === 'text');
      const text = textBlock?.type === 'text' ? textBlock.text : '';
      const onCompleteContext = request.onComplete?.(text) ?? {};
      return withLogContext(result, {
        messageId: result.id,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        stopReason: result.stop_reason,
        ...onCompleteContext,
      });
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

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
   * Embeddings are not supported by Anthropic.
   * Configure OpenAI, Ollama, or Local as the embedding provider.
   */
  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error(
      'Anthropic does not support embeddings. Configure OpenAI, Ollama, or Local as your embedding provider.'
    );
  }
}

/**
 * Create an Anthropic provider instance
 */
export function createAnthropicProvider(config: AnthropicConfig, context: PluginContext): AnthropicProvider {
  return new AnthropicProvider(config, context);
}

/**
 * Extension manifest for Anthropic Claude
 */
export const manifest: AIAppManifest = {
  id: 'anthropic',
  name: 'Anthropic Claude',
  category: 'ai',
  version: '1.0.0',
  description: 'Claude AI models by Anthropic - advanced reasoning and conversation',
  icon: '🤖',
  docsUrl: 'https://docs.anthropic.com',
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      description: 'Your Anthropic API key',
      placeholder: 'sk-ant-...',
    },
    {
      key: 'model',
      label: 'Completion Model',
      type: 'select',
      required: false,
      description: 'Primary model for generating guest responses and conversations',
      default: DEFAULT_MODEL,
      options: [
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recommended)' },
        { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Most Capable)' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fastest)' },
      ],
    },
    {
      key: 'utilityModel',
      label: 'Utility Model',
      type: 'select',
      required: false,
      description: 'Smaller model for translation, classification, and search queries. Falls back to completion model if not set.',
      default: 'claude-haiku-4-5-20251001',
      options: [
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Recommended)' },
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
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
  ],
  capabilities: {
    completion: true,
    embedding: false,
    streaming: true,
  },
  createProvider: (config, context) => createAnthropicProvider(config as unknown as AnthropicConfig, context),
};

export default { manifest };
