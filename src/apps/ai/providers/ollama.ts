/**
 * Ollama Provider Extension
 *
 * Local LLM support via Ollama for self-hosted AI.
 *
 * @module extensions/ai/providers/ollama
 */

import type {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from '@/core/interfaces/ai.js';
import type { AIAppManifest, BaseProvider, ConnectionTestResult } from '../../types.js';
import { createAppLogger, withLogContext, AppLogError } from '@/apps/instrumentation.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('extensions:ai:ollama');

/**
 * Default Ollama models
 */
const DEFAULT_MODEL = 'llama3.1';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';
const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Ollama API response types
 */
interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaTagsResponse {
  models: Array<{ name: string; modified_at: string }>;
}

/**
 * Ollama provider configuration
 */
export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  utilityModel?: string;
  embeddingModel?: string;
}

/**
 * Ollama provider implementation
 */
export class OllamaProvider implements AIProvider, BaseProvider {
  readonly id = 'ollama';
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;
  private utilityModel: string;
  private embeddingModel: string;
  readonly appLog = createAppLogger('ai', 'ollama');

  constructor(config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;
    this.utilityModel = config.utilityModel || this.model;
    this.embeddingModel = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;

    log.info(
      { baseUrl: this.baseUrl, model: this.model, utilityModel: this.utilityModel, embeddingModel: this.embeddingModel },
      'Ollama provider initialized'
    );
  }

  /**
   * Test connection to Ollama server
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Check if Ollama server is running and get available models
      const data = await this.appLog('connection_test', { baseUrl: this.baseUrl }, async () => {
        const response = await fetch(`${this.baseUrl}/api/tags`);
        if (!response.ok) {
          throw new AppLogError(`Ollama server returned ${response.status}`, { httpStatus: response.status });
        }
        const result = await response.json() as OllamaTagsResponse;
        return withLogContext(result, { modelCount: (result as OllamaTagsResponse).models?.length ?? 0 });
      });
      const latencyMs = Date.now() - startTime;

      const modelNames = data.models.map((m) => m.name);
      const hasModel = modelNames.some((name) => name.includes(this.model));

      return {
        success: true,
        message: hasModel
          ? 'Successfully connected to Ollama server'
          : `Connected to Ollama, but model "${this.model}" not found`,
        details: {
          baseUrl: this.baseUrl,
          configuredModel: this.model,
          availableModels: modelNames.slice(0, 10),
          modelAvailable: hasModel,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'Ollama connection test failed');

      return {
        success: false,
        message: `Connection failed: ${message}`,
        details: {
          baseUrl: this.baseUrl,
          hint: 'Make sure Ollama is running: ollama serve',
        },
        latencyMs,
      };
    }
  }

  /**
   * Generate a completion using Ollama
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.modelTier === 'utility' ? this.utilityModel : this.model;

    log.debug({ messageCount: request.messages.length, model }, 'Sending completion request');

    const data = await this.appLog('completion', { model }, async () => {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
          options: {
            num_predict: request.maxTokens || 1024,
            temperature: request.temperature || 0.7,
            stop: request.stopSequences,
          },
        }),
      });
      if (!response.ok) {
        throw new AppLogError(`Ollama API error: ${response.status} ${response.statusText}`, { httpStatus: response.status });
      }
      const data = await response.json() as OllamaChatResponse;
      return withLogContext(data, { promptTokens: data.prompt_eval_count, completionTokens: data.eval_count });
    });

    log.debug(
      {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      },
      'Completion response received'
    );

    return {
      content: data.message.content.trim(),
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

    const data = await this.appLog('embedding', { model: this.embeddingModel }, async () => {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.embeddingModel, prompt: request.text }),
      });
      if (!response.ok) {
        throw new AppLogError(`Ollama API error: ${response.status} ${response.statusText}`, { httpStatus: response.status });
      }
      const data = await response.json() as OllamaEmbeddingResponse;
      return withLogContext(data, { dimensions: (data as OllamaEmbeddingResponse).embedding?.length });
    });

    log.debug({ dimensions: data.embedding.length }, 'Embedding generated');

    return {
      embedding: data.embedding,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

/**
 * Create an Ollama provider instance
 */
export function createOllamaProvider(config: OllamaConfig = {}): OllamaProvider {
  return new OllamaProvider(config);
}

/**
 * Extension manifest for Ollama
 */
export const manifest: AIAppManifest = {
  id: 'ollama',
  name: 'Ollama',
  category: 'ai',
  version: '1.0.0',
  description: 'Run AI models locally with Ollama - full privacy, no API costs',
  icon: '🦙',
  docsUrl: 'https://ollama.ai/docs',
  configSchema: [
    {
      key: 'baseUrl',
      label: 'Server URL',
      type: 'text',
      required: false,
      description: 'Ollama server URL',
      default: DEFAULT_BASE_URL,
      placeholder: 'http://localhost:11434',
    },
    {
      key: 'model',
      label: 'Completion Model',
      type: 'text',
      required: false,
      description: 'Primary model for generating guest responses (must be pulled first)',
      default: DEFAULT_MODEL,
      placeholder: 'llama3.1',
    },
    {
      key: 'utilityModel',
      label: 'Utility Model',
      type: 'text',
      required: false,
      description: 'Smaller model for translation, classification, and search queries. Falls back to completion model if not set.',
      placeholder: 'llama3.2:1b',
    },
    {
      key: 'embeddingModel',
      label: 'Embedding Model',
      type: 'text',
      required: false,
      description: 'Model name for embeddings',
      default: DEFAULT_EMBEDDING_MODEL,
      placeholder: 'nomic-embed-text',
    },
  ],
  capabilities: {
    completion: true,
    embedding: true,
    streaming: true,
  },
  createProvider: (config) => createOllamaProvider(config as OllamaConfig),
};
