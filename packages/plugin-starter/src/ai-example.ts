/**
 * Jack The Butler — AI Provider Plugin Example
 *
 * Copy this file as your starting point for a new AI provider plugin.
 *
 * Steps:
 * 1. Copy packages/plugin-starter to packages/ai-yourprovider/
 * 2. Update package.json name to @jackthebutler/ai-yourprovider
 * 3. Replace StarterAIProvider with your real implementation
 * 4. Update the manifest: id, name, description, configSchema, capabilities
 * 5. Add to root package.json as `"@jackthebutler/ai-yourprovider": "workspace:*"` and run: pnpm install && pnpm typecheck
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
} from '@jackthebutler/shared';
import { withLogContext } from '@jackthebutler/shared';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface StarterAIConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * AI providers implement both AIProvider and BaseProvider.
 *
 * AIProvider    — complete() and embed() methods Jack calls to generate responses
 * BaseProvider  — requires readonly appLog and testConnection(): Promise<ConnectionTestResult>
 *
 * Note: testConnection() returns ConnectionTestResult (not boolean) for AI/channel plugins.
 * PMS plugins use Promise<boolean> — different contract.
 */
export class StarterAIProvider implements AIProvider, BaseProvider {
  readonly id = 'ai-starter';
  readonly name = 'starter';
  readonly appLog: AppLogger;
  private model: string;
  private maxTokens: number;
  private apiKey: string;

  constructor(config: StarterAIConfig, context: PluginContext) {
    this.appLog = context.appLog;
    if (!config.apiKey) throw new Error('StarterAI requires an API key');
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'starter-default';
    this.maxTokens = config.maxTokens ?? 1024;
  }

  // ── BaseProvider ────────────────────────────────────────────────────────────

  /**
   * testConnection() for AI/channel returns ConnectionTestResult, not boolean.
   * Make a lightweight call to verify the API key is valid.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      await this.appLog('connection_test', { model: this.model }, async () => {
        // Replace with a real lightweight call, e.g. list models
        await fetch('https://api.example.com/models', {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
      });
      return {
        success: true,
        message: 'Connected to Starter AI',
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // ── AIProvider ──────────────────────────────────────────────────────────────

  /**
   * Generate a completion response.
   * Wrap the API call with this.appLog() — powers the System Health dashboard.
   * Use withLogContext() to attach extra metadata to the log entry.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.appLog(
      'completion',
      { model: this.model, ...(request.purpose && { purpose: request.purpose }) },
      async () => {
        // Replace with your real API call
        const response = await fetch('https://api.example.com/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: request.messages,
            max_tokens: request.maxTokens ?? this.maxTokens,
          }),
        });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json() as { content: string };

        const onCompleteContext = request.onComplete?.(data.content) ?? {};
        // withLogContext passes the result through while attaching metadata to the log entry
        return withLogContext(
          { content: data.content, usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn' },
          { contentLength: data.content.length, ...onCompleteContext }
        );
      }
    );
  }

  /**
   * Generate embeddings for semantic search.
   * Return null if your provider doesn't support embeddings —
   * Jack will fall back to the local provider for embeddings.
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.appLog('embedding', { model: this.model }, async () => {
      const response = await fetch('https://api.example.com/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: this.model, input: request.text }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json() as { embedding: number[] };

      return withLogContext(
        { embedding: data.embedding, usage: { inputTokens: 0, outputTokens: 0 } },
        { dimensions: data.embedding.length }
      );
    });
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStarterAIProvider(config: StarterAIConfig, context: PluginContext): StarterAIProvider {
  return new StarterAIProvider(config, context);
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

export const manifest: AIAppManifest = {
  id: 'ai-starter',
  name: 'Starter AI',
  category: 'ai',
  version: '1.0.0',
  description: 'Example AI provider plugin — replace with your real integration',
  icon: '🤖',
  docsUrl: 'https://docs.example.com/api',
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      description: 'Your AI provider API key',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      required: false,
      placeholder: 'starter-default',
      description: 'Model name to use for completions',
    },
    {
      key: 'maxTokens',
      label: 'Max Tokens',
      type: 'number',
      required: false,
      default: 1024,
      description: 'Maximum tokens per completion',
    },
  ],
  capabilities: {
    completion: true,
    embedding: true,   // set false if your provider has no embeddings API
    streaming: false,
  },
  createProvider: (config, context) => createStarterAIProvider(config as unknown as StarterAIConfig, context),
};

export default { manifest };
