/**
 * Local AI Provider Extension
 *
 * Built-in AI provider using Transformers.js for local inference.
 * Provides semantic embeddings and basic completion without external APIs.
 *
 * @module extensions/ai/providers/local
 */

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
import { createLogger } from '@/utils/logger.js';
import { events, EventTypes } from '@/events/index.js';

const log = createLogger('extensions:ai:local');

/**
 * Embedding model - small and fast, produces 384-dimensional vectors
 */
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Completion model - Llama 3.2 1B for efficient local text generation
 * Note: Using quantized (q4f16) version for lower RAM usage (~2-3GB)
 */
const COMPLETION_MODEL = 'onnx-community/Llama-3.2-1B-Instruct-ONNX';

/**
 * Local provider configuration
 */
export interface LocalConfig {
  embeddingModel?: string;
  completionModel?: string;
  utilityModel?: string;
  cacheDir?: string;
}

// Lazy-loaded transformers module (heavy dependency)
let transformersModule: typeof import('@huggingface/transformers') | null = null;

/**
 * Lazy load the transformers module
 */
async function getTransformers(): Promise<typeof import('@huggingface/transformers')> {
  if (!transformersModule) {
    log.debug('Loading @huggingface/transformers module...');
    transformersModule = await import('@huggingface/transformers');
    log.debug('Transformers module loaded');
  }
  return transformersModule;
}

/**
 * Pipeline interfaces for transformers.js v3
 * Using simplified types to avoid complex union type inference
 */
interface FeatureExtractionPipeline {
  (text: string, options?: { pooling?: string; normalize?: boolean }): Promise<{ data: Float32Array }>;
}

interface TextGenerationPipeline {
  (
    text: string | Array<{ role: string; content: string }>,
    options?: { max_new_tokens?: number; temperature?: number; do_sample?: boolean; top_p?: number }
  ): Promise<Array<{ generated_text: string }>>;
}

/**
 * Local AI Provider implementation using Transformers.js v3
 *
 * Features:
 * - Semantic embeddings using all-MiniLM-L6-v2 (~80MB)
 * - Multiple completion model options:
 *   - Llama 3.2 1B (~1.2GB, 128K context) - Default
 *   - Gemma 3 1B (~1GB, Google)
 *   - SmolLM2 1.7B (~3.4GB, optimized for on-device)
 *   - Phi-3 Mini (~2GB, 3.8B params, best quality)
 * - No external API calls required
 * - Models downloaded on first use and cached
 *
 * Note: Cloud AI (Anthropic, OpenAI) is still recommended for production.
 */
export class LocalAIProvider implements AIProvider, BaseProvider {
  readonly id = 'local';
  readonly name = 'local';

  readonly appLog: AppLogger;

  private embeddingModel: string;
  private completionModel: string;
  private utilityModel: string;
  private embeddingPipeline: FeatureExtractionPipeline | null = null;
  private completionPipelines = new Map<string, TextGenerationPipeline>();
  private loadingPipelines = new Set<string>();
  private isLoadingEmbedding = false;

  constructor(config: LocalConfig = {}, context: PluginContext) {
    this.appLog = context.appLog;
    this.embeddingModel = config.embeddingModel || EMBEDDING_MODEL;
    this.completionModel = config.completionModel || COMPLETION_MODEL;
    this.utilityModel = config.utilityModel || this.completionModel;

    log.info(
      {
        embeddingModel: this.embeddingModel,
        completionModel: this.completionModel,
        utilityModel: this.utilityModel,
      },
      'Local AI provider initialized'
    );
  }

  /**
   * Test connection by loading the embedding model
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      log.debug('Testing local AI provider by loading embedding model...');

      await this.appLog('connection_test', { model: this.embeddingModel }, () =>
        this.getEmbeddingPipeline()
      );

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        message: 'Local AI provider is ready',
        details: {
          embeddingModel: this.embeddingModel,
          completionModel: this.completionModel,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error }, 'Local AI provider test failed');

      return {
        success: false,
        message: `Local AI initialization failed: ${message}`,
        latencyMs,
      };
    }
  }

  /**
   * Get or create the embedding pipeline (lazy loaded)
   */
  private async getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.embeddingPipeline) {
      return this.embeddingPipeline;
    }

    // Prevent concurrent loading
    if (this.isLoadingEmbedding) {
      log.debug('Waiting for embedding model to finish loading...');
      while (this.isLoadingEmbedding) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.embeddingPipeline) {
        return this.embeddingPipeline;
      }
    }

    this.isLoadingEmbedding = true;
    try {
      log.info({ model: this.embeddingModel }, 'Loading embedding model (this may take a moment on first run)...');
      const { pipeline } = await getTransformers();

      // Emit progress events during model download
      const progressCallback = (progress: {
        status: string;
        file?: string;
        progress?: number;
        loaded?: number;
        total?: number;
      }) => {
        const payload: {
          model: string;
          status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
          file?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        } = {
          model: this.embeddingModel,
          status: progress.status as 'initiate' | 'download' | 'progress' | 'done' | 'ready',
        };
        if (progress.file) payload.file = progress.file;
        if (progress.progress !== undefined) payload.progress = Math.round(progress.progress * 100);
        if (progress.loaded !== undefined) payload.loaded = progress.loaded;
        if (progress.total !== undefined) payload.total = progress.total;

        events.emit({
          type: EventTypes.MODEL_DOWNLOAD_PROGRESS,
          timestamp: new Date(),
          payload,
        });
      };

      this.embeddingPipeline = (await pipeline('feature-extraction', this.embeddingModel, {
        progress_callback: progressCallback,
      })) as unknown as FeatureExtractionPipeline;

      log.info({ model: this.embeddingModel }, 'Embedding model loaded');
      return this.embeddingPipeline;
    } finally {
      this.isLoadingEmbedding = false;
    }
  }

  /**
   * Get or create a text generation pipeline by model name (lazy loaded, cached).
   */
  private async getTextPipeline(modelName: string): Promise<TextGenerationPipeline> {
    const cached = this.completionPipelines.get(modelName);
    if (cached) return cached;

    // Prevent concurrent loading of the same model
    if (this.loadingPipelines.has(modelName)) {
      log.debug({ model: modelName }, 'Waiting for model to finish loading...');
      while (this.loadingPipelines.has(modelName)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const ready = this.completionPipelines.get(modelName);
      if (ready) return ready;
    }

    this.loadingPipelines.add(modelName);
    try {
      log.info({ model: modelName }, 'Loading text generation model (this may take a moment on first run)...');
      const { pipeline: createPipeline } = await getTransformers();

      const progressCallback = (progress: {
        status: string;
        file?: string;
        progress?: number;
        loaded?: number;
        total?: number;
      }) => {
        const payload: {
          model: string;
          status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
          file?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        } = {
          model: modelName,
          status: progress.status as 'initiate' | 'download' | 'progress' | 'done' | 'ready',
        };
        if (progress.file) payload.file = progress.file;
        if (progress.progress !== undefined) payload.progress = Math.round(progress.progress * 100);
        if (progress.loaded !== undefined) payload.loaded = progress.loaded;
        if (progress.total !== undefined) payload.total = progress.total;

        events.emit({
          type: EventTypes.MODEL_DOWNLOAD_PROGRESS,
          timestamp: new Date(),
          payload,
        });
      };

      const p = (await createPipeline('text-generation', modelName, {
        progress_callback: progressCallback,
      })) as unknown as TextGenerationPipeline;

      this.completionPipelines.set(modelName, p);
      log.info({ model: modelName }, 'Text generation model loaded');
      return p;
    } finally {
      this.loadingPipelines.delete(modelName);
    }
  }

  /**
   * Generate embeddings using local transformer model
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    log.debug({ textLength: request.text.length }, 'Generating local embedding');

    return this.appLog('embedding', { model: this.embeddingModel, ...(request.purpose && { purpose: request.purpose }) }, async () => {
      const extractor = await this.getEmbeddingPipeline();

      const output = await extractor(request.text, {
        pooling: 'mean',
        normalize: true,
      });

      const embedding = Array.from(output.data as Float32Array);
      log.debug({ dimensions: embedding.length }, 'Local embedding generated');

      return withLogContext({ embedding, usage: { inputTokens: 0, outputTokens: 0 } }, {
        dimensions: embedding.length,
      });
    });
  }

  /**
   * Generate completion using local LLM
   *
   * Note: The local model is much smaller than cloud models,
   * so responses may be less sophisticated. This is primarily
   * a fallback for when no cloud AI is configured.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelName = request.modelTier === 'utility' ? this.utilityModel : this.completionModel;
    log.debug({ messageCount: request.messages.length, model: modelName }, 'Generating local completion');

    return this.appLog('completion', { model: modelName, ...(request.purpose && { purpose: request.purpose }) }, async () => {
      const generator = await this.getTextPipeline(modelName);
      const prompt = this.buildPrompt(request.messages, modelName);

      const outputs = (await generator(prompt, {
        max_new_tokens: request.maxTokens || 256,
        temperature: request.temperature ?? 0.7,
        do_sample: true,
        top_p: 0.95,
      })) as { generated_text: string }[];

      const generated = outputs[0]?.generated_text || '';
      const content = generated.slice(prompt.length).trim();

      log.debug({ contentLength: content.length }, 'Local completion generated');

      const onCompleteContext = request.onComplete?.(content) ?? {};
      return withLogContext({ content, usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn' }, {
        contentLength: content.length,
        ...onCompleteContext,
      });
    });
  }

  /**
   * Build a prompt string from messages based on the model's chat template
   */
  private buildPrompt(messages: { role: string; content: string }[], modelName: string): string {
    // Detect model type and use appropriate format
    if (modelName.includes('Llama-3')) {
      return this.buildLlamaPrompt(messages);
    } else if (modelName.includes('gemma')) {
      return this.buildGemmaPrompt(messages);
    } else if (modelName.includes('SmolLM')) {
      return this.buildChatMLPrompt(messages);
    } else if (modelName.includes('Phi-3')) {
      return this.buildPhi3Prompt(messages);
    }
    // Default to ChatML (most common)
    return this.buildChatMLPrompt(messages);
  }

  /**
   * Llama 3.x chat format
   */
  private buildLlamaPrompt(messages: { role: string; content: string }[]): string {
    const parts: string[] = ['<|begin_of_text|>'];

    for (const msg of messages) {
      parts.push(`<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`);
    }

    // Add assistant header to continue
    parts.push('<|start_header_id|>assistant<|end_header_id|>\n\n');

    return parts.join('');
  }

  /**
   * Gemma chat format
   */
  private buildGemmaPrompt(messages: { role: string; content: string }[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : msg.role;
      parts.push(`<start_of_turn>${role}\n${msg.content}<end_of_turn>`);
    }

    // Add model turn to continue
    parts.push('<start_of_turn>model\n');

    return parts.join('\n');
  }

  /**
   * ChatML format (SmolLM2, Qwen, etc.)
   */
  private buildChatMLPrompt(messages: { role: string; content: string }[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      parts.push(`<|im_start|>${msg.role}\n${msg.content}<|im_end|>`);
    }

    // Add assistant prompt to continue
    parts.push('<|im_start|>assistant\n');

    return parts.join('\n');
  }

  /**
   * Phi-3 chat format
   */
  private buildPhi3Prompt(messages: { role: string; content: string }[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      parts.push(`<|${msg.role}|>\n${msg.content}<|end|>`);
    }

    // Add assistant prompt to continue
    parts.push('<|assistant|>');

    return parts.join('\n');
  }
}

/**
 * Create a local provider instance
 */
export function createLocalProvider(config: LocalConfig = {}, context: PluginContext): LocalAIProvider {
  return new LocalAIProvider(config, context);
}

/**
 * Extension manifest for Local AI
 */
export const manifest: AIAppManifest = {
  id: 'local',
  name: 'Local AI',
  category: 'ai',
  version: '2.0.0',
  description: 'Run AI locally with Transformers.js - embeddings and completion without external APIs',
  icon: '🏠',
  configSchema: [
    {
      key: 'embeddingModel',
      label: 'Embedding Model',
      type: 'select',
      required: false,
      description: 'Model for semantic search embeddings',
      default: EMBEDDING_MODEL,
      options: [
        { value: 'Xenova/all-MiniLM-L6-v2', label: 'MiniLM-L6 (80MB, Fast, Recommended)' },
        { value: 'Xenova/all-MiniLM-L12-v2', label: 'MiniLM-L12 (120MB, Better Quality)' },
        { value: 'Xenova/bge-small-en-v1.5', label: 'BGE Small (130MB, High Quality)' },
        { value: 'Xenova/gte-small', label: 'GTE Small (70MB, Fast)' },
      ],
    },
    {
      key: 'completionModel',
      label: 'Completion Model',
      type: 'select',
      required: false,
      description: 'Primary model for generating guest responses and conversations',
      default: COMPLETION_MODEL,
      options: [
        { value: 'onnx-community/Llama-3.2-1B-Instruct-ONNX', label: 'Llama 3.2 1B (1.2GB, 128K context, Default)' },
        { value: 'onnx-community/gemma-3-1b-it-ONNX', label: 'Gemma 3 1B (1GB, Google)' },
        { value: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', label: 'SmolLM2 1.7B (3.4GB, Balanced)' },
        { value: 'onnx-community/Phi-3-mini-4k-instruct-onnx', label: 'Phi-3 Mini (2GB, Best Quality)' },
      ],
    },
    {
      key: 'utilityModel',
      label: 'Utility Model',
      type: 'select',
      required: false,
      description: 'Smaller model for translation, classification, and search queries. Falls back to completion model if not set.',
      options: [
        { value: 'onnx-community/Llama-3.2-1B-Instruct-ONNX', label: 'Llama 3.2 1B (1.2GB, Default)' },
        { value: 'onnx-community/gemma-3-1b-it-ONNX', label: 'Gemma 3 1B (1GB, Google)' },
      ],
    },
  ],
  capabilities: {
    completion: true,
    embedding: true,
    streaming: false,
  },
  createProvider: (config, context) => createLocalProvider(config as unknown as LocalConfig, context),
};
