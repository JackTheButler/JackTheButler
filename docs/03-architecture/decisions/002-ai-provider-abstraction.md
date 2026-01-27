# ADR-002: AI Provider Abstraction

## Status

Accepted

## Context

Jack The Butler relies on Large Language Models (LLMs) for:
- Intent classification
- Response generation
- Sentiment analysis
- Skill/tool execution

The LLM landscape is rapidly evolving with multiple providers (Anthropic, OpenAI, Google, local models) offering different capabilities, pricing, and performance characteristics.

### Constraints

- Hotels may have preferences or restrictions on AI providers
- Some regions may require data to stay on-premise (local models)
- Provider outages should not bring down the entire system
- Costs vary significantly between providers
- New providers and models are released frequently

### Requirements

- Support multiple AI providers
- Enable fallback when primary provider is unavailable
- Allow provider selection based on task type
- Support future providers without major refactoring

## Decision

Implement an **AI Provider Abstraction Layer** that:

1. Defines a common interface for all AI operations
2. Implements adapters for each supported provider
3. Supports provider configuration per property
4. Enables automatic fallback between providers
5. Routes different task types to optimal providers

### Interface Definition

```typescript
// =============================================================================
// CORE PROVIDER INTERFACE
// =============================================================================

/**
 * Abstract interface for LLM providers.
 * Implementations: ClaudeProvider, OpenAIProvider, OllamaProvider
 */
interface AIProvider {
  readonly name: string;
  readonly modelId: string;

  // --- Core Operations ---

  /**
   * Generate a completion (chat response).
   * Used for response generation, intent classification (via structured output).
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Generate a streaming completion.
   * Returns an async iterator for real-time response streaming.
   */
  completeStream(request: CompletionRequest): AsyncIterable<CompletionChunk>;

  /**
   * Generate embeddings for text.
   * Used for RAG similarity search.
   */
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  // --- Capability Discovery ---

  /** Check if provider supports tool/function calling */
  supportsTools(): boolean;

  /** Check if provider supports vision (image input) */
  supportsVision(): boolean;

  /** Check if provider supports structured output (JSON mode) */
  supportsStructuredOutput(): boolean;

  /** Maximum context window in tokens */
  maxContextTokens(): number;

  /** Embedding dimensions (if embedding supported) */
  embeddingDimensions(): number | null;

  // --- Health & Status ---

  /** Check if provider is available and responding */
  healthCheck(): Promise<HealthCheckResult>;
}

// =============================================================================
// REQUEST TYPES
// =============================================================================

interface CompletionRequest {
  /** Conversation messages */
  messages: ChatMessage[];

  /** System prompt (optional, can also be first message) */
  systemPrompt?: string;

  /** Available tools/functions the model can call */
  tools?: Tool[];

  /** Control randomness (0.0 = deterministic, 1.0 = creative) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** Force structured JSON output */
  jsonMode?: boolean;

  /** Expected JSON schema (if jsonMode is true) */
  responseSchema?: JSONSchema;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Unique request ID for tracing */
  requestId?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[];

  /** Tool call ID (if role is 'tool') */
  toolCallId?: string;

  /** Tool calls made by assistant */
  toolCalls?: ToolCall[];
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string };

interface ImageSource {
  type: 'base64' | 'url';
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // base64 data or URL
}

interface EmbeddingRequest {
  /** Text(s) to embed */
  input: string | string[];

  /** Model to use (if provider supports multiple) */
  model?: string;
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

interface CompletionResponse {
  /** Unique response ID */
  id: string;

  /** Generated content */
  content: string;

  /** Tool calls requested by the model */
  toolCalls?: ToolCall[];

  /** Why generation stopped */
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';

  /** Token usage */
  usage: TokenUsage;

  /** Model that generated the response */
  model: string;

  /** Response latency in milliseconds */
  latencyMs: number;
}

interface CompletionChunk {
  /** Chunk type */
  type: 'content_delta' | 'tool_use_delta' | 'done';

  /** Partial content (for streaming) */
  delta?: string;

  /** Tool call in progress */
  toolCall?: Partial<ToolCall>;

  /** Final usage (only in 'done' chunk) */
  usage?: TokenUsage;
}

interface EmbeddingResponse {
  /** Generated embeddings (one per input) */
  embeddings: number[][];

  /** Model used */
  model: string;

  /** Token usage */
  usage: {
    totalTokens: number;
  };
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  /** Cache read tokens (Claude-specific) */
  cacheReadTokens?: number;
  /** Cache write tokens (Claude-specific) */
  cacheWriteTokens?: number;
}

// =============================================================================
// TOOL/FUNCTION CALLING
// =============================================================================

interface Tool {
  /** Tool name (must match skill ID) */
  name: string;

  /** Human-readable description for the model */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema: JSONSchema;
}

interface ToolCall {
  /** Unique ID for this tool call */
  id: string;

  /** Tool name */
  name: string;

  /** Parsed input arguments */
  input: Record<string, unknown>;
}

type JSONSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

// =============================================================================
// HEALTH & ERRORS
// =============================================================================

interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  checkedAt: Date;
}

/**
 * Base error for all AI provider errors.
 * Includes context for logging and retry decisions.
 */
class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: AIErrorCode,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

type AIErrorCode =
  | 'AUTHENTICATION_ERROR'    // Invalid API key
  | 'RATE_LIMITED'            // Too many requests
  | 'QUOTA_EXCEEDED'          // Billing/usage limit
  | 'CONTEXT_LENGTH_EXCEEDED' // Input too long
  | 'CONTENT_FILTERED'        // Content policy violation
  | 'MODEL_UNAVAILABLE'       // Model not available
  | 'TIMEOUT'                 // Request timed out
  | 'NETWORK_ERROR'           // Connection failed
  | 'INVALID_REQUEST'         // Malformed request
  | 'INTERNAL_ERROR'          // Provider internal error
  | 'UNKNOWN';                // Unknown error

// =============================================================================
// RETRY & RATE LIMITING CONFIGURATION
// =============================================================================

interface RetryConfig {
  /** Maximum retry attempts (including initial) */
  maxAttempts: number;

  /** Initial delay between retries in ms */
  initialDelayMs: number;

  /** Maximum delay between retries in ms */
  maxDelayMs: number;

  /** Backoff multiplier (e.g., 2 for exponential) */
  backoffMultiplier: number;

  /** Add jitter to prevent thundering herd */
  jitter: boolean;

  /** Error codes that should trigger retry */
  retryableErrors: AIErrorCode[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    'RATE_LIMITED',
    'TIMEOUT',
    'NETWORK_ERROR',
    'INTERNAL_ERROR'
  ]
};

interface RateLimitConfig {
  /** Requests per minute */
  requestsPerMinute: number;

  /** Tokens per minute (if applicable) */
  tokensPerMinute?: number;

  /** Concurrent request limit */
  maxConcurrent: number;
}

// =============================================================================
// AI SERVICE (ORCHESTRATION LAYER)
// =============================================================================

/**
 * High-level service that orchestrates AI providers.
 * Handles provider selection, fallback, retries, and caching.
 */
interface AIService {
  /**
   * Classify the intent of a guest message.
   * Returns structured classification with confidence.
   */
  classifyIntent(
    message: string,
    context: ConversationContext
  ): Promise<IntentClassification>;

  /**
   * Generate a response to send to the guest.
   * Includes context, knowledge retrieval, and tool execution.
   */
  generateResponse(
    message: string,
    context: ConversationContext
  ): Promise<GeneratedResponse>;

  /**
   * Analyze sentiment of a message.
   * Usually combined with intent classification in a single call.
   */
  analyzeSentiment(message: string): Promise<SentimentResult>;

  /**
   * Generate embeddings for RAG indexing or search.
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Execute a skill/tool based on classified intent.
   */
  executeSkill(
    skillId: string,
    params: Record<string, unknown>,
    context: ConversationContext
  ): Promise<SkillResult>;
}

interface IntentClassification {
  intent: string;              // e.g., "request.service.towels"
  confidence: number;          // 0.0 - 1.0
  entities: ExtractedEntity[]; // Extracted parameters
  sentiment: SentimentResult;  // Combined in same call
  language: string;            // Detected language (ISO 639-1)
  alternativeIntents?: Array<{ intent: string; confidence: number }>;
}

interface ExtractedEntity {
  type: string;    // e.g., "quantity", "room_number", "date"
  value: unknown;  // Extracted value
  confidence: number;
  raw?: string;    // Original text that was extracted
}

interface SentimentResult {
  polarity: 'positive' | 'neutral' | 'negative';
  score: number;           // -1.0 to 1.0
  indicators: string[];    // Phrases that influenced score
  escalationRisk: 'low' | 'medium' | 'high';
}

interface GeneratedResponse {
  content: string;
  toolCalls?: ToolCall[];
  confidence: number;
  shouldEscalate: boolean;
  escalationReason?: string;
  usage: TokenUsage;
}

interface SkillResult {
  success: boolean;
  partial?: boolean;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

interface ConversationContext {
  conversationId: string;
  messages: ChatMessage[];
  guest?: {
    id: string;
    name: string;
    loyaltyTier?: string;
    preferences: Array<{ category: string; key: string; value: string }>;
  };
  reservation?: {
    confirmationNumber: string;
    roomNumber?: string;
    arrivalDate: string;
    departureDate: string;
  };
  property: {
    name: string;
    timezone: string;
  };
}
```

### Provider Configuration

```yaml
ai:
  defaultProvider: claude

  providers:
    claude:
      enabled: true
      model: claude-sonnet-4-20250514
      priority: 1

    openai:
      enabled: true
      model: gpt-4o
      priority: 2  # Fallback

    local:
      enabled: false
      model: llama-3.1-8b
      endpoint: http://localhost:11434

  routing:
    intentClassification: claude
    responseGeneration: claude
    embedding: openai  # text-embedding-3-small
```

## Consequences

### Positive

- **Flexibility**: Hotels can choose providers based on needs, cost, or compliance
- **Resilience**: Automatic fallback prevents complete outages
- **Cost optimization**: Route simple tasks to cheaper models
- **Future-proof**: New providers added without core changes
- **Testing**: Easy to mock providers for testing
- **Local deployment**: Support on-premise models for data sovereignty

### Negative

- **Complexity**: Additional abstraction layer to maintain
- **Lowest common denominator**: May not leverage provider-specific features
- **Configuration overhead**: More settings to manage
- **Testing surface**: Must test each provider integration

### Risks

- Provider-specific features underutilized - mitigate by allowing provider hints for specific operations
- Inconsistent behavior across providers - mitigate with comprehensive prompt testing

## Alternatives Considered

### Option A: Single Provider (Claude Only)

Lock in to Anthropic's Claude for all AI operations.

- **Pros**: Simpler implementation, optimized prompts for one model, consistent behavior
- **Cons**: Vendor lock-in, no fallback, can't meet all regional requirements, no cost optimization

### Option B: LangChain/LlamaIndex Abstraction

Use existing frameworks for provider abstraction.

- **Pros**: Battle-tested, community support, rich features
- **Cons**: Heavy dependencies, may not fit our specific needs, abstracts away useful details, harder to optimize

### Option C: Task-Specific Services

Separate services for each AI task (intent service, response service, etc.) each with their own provider.

- **Pros**: Maximum flexibility, independent scaling
- **Cons**: Operational complexity, more services to deploy, harder to maintain consistency

### Provider Implementations

Example skeleton implementations for each supported provider:

```typescript
// =============================================================================
// CLAUDE PROVIDER (Anthropic)
// =============================================================================

class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  readonly modelId: string;

  private client: Anthropic;
  private rateLimiter: RateLimiter;

  constructor(config: ClaudeConfig) {
    this.modelId = config.model || 'claude-sonnet-4-20250514';
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.rateLimiter = new RateLimiter(config.rateLimit || {
      requestsPerMinute: 60,
      tokensPerMinute: 100000,
      maxConcurrent: 10
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    await this.rateLimiter.acquire();

    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: request.maxTokens || 1024,
        temperature: request.temperature ?? 0.7,
        system: request.systemPrompt,
        messages: this.mapMessages(request.messages),
        tools: request.tools?.map(this.mapTool),
        stop_sequences: request.stopSequences
      });

      return {
        id: response.id,
        content: this.extractContent(response),
        toolCalls: this.extractToolCalls(response),
        stopReason: this.mapStopReason(response.stop_reason),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens,
          cacheWriteTokens: response.usage.cache_creation_input_tokens
        },
        model: response.model,
        latencyMs: Date.now() - startTime
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async *completeStream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    await this.rateLimiter.acquire();

    const stream = await this.client.messages.stream({
      model: this.modelId,
      max_tokens: request.maxTokens || 1024,
      messages: this.mapMessages(request.messages),
      tools: request.tools?.map(this.mapTool)
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        yield { type: 'content_delta', delta: event.delta.text };
      } else if (event.type === 'message_stop') {
        yield { type: 'done', usage: this.mapUsage(event.message.usage) };
      }
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // Claude doesn't have native embeddings; delegate to Voyage AI or use OpenAI
    throw new AIProviderError(
      'Claude does not support embeddings natively',
      'claude',
      'INVALID_REQUEST',
      false
    );
  }

  supportsTools(): boolean { return true; }
  supportsVision(): boolean { return true; }
  supportsStructuredOutput(): boolean { return true; }
  maxContextTokens(): number { return 200000; } // Claude 3.5
  embeddingDimensions(): number | null { return null; }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.client.messages.create({
        model: this.modelId,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      });
      return { healthy: true, latencyMs: Date.now() - start, checkedAt: new Date() };
    } catch (error) {
      return { healthy: false, latencyMs: Date.now() - start, error: error.message, checkedAt: new Date() };
    }
  }

  private mapError(error: unknown): AIProviderError {
    if (error instanceof Anthropic.RateLimitError) {
      return new AIProviderError(error.message, 'claude', 'RATE_LIMITED', true, 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return new AIProviderError(error.message, 'claude', 'AUTHENTICATION_ERROR', false, 401);
    }
    // ... map other error types
    return new AIProviderError(String(error), 'claude', 'UNKNOWN', false);
  }
}

// =============================================================================
// OPENAI PROVIDER
// =============================================================================

class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly modelId: string;

  private client: OpenAI;
  private embeddingModel: string;

  constructor(config: OpenAIConfig) {
    this.modelId = config.model || 'gpt-4o';
    this.embeddingModel = config.embeddingModel || 'text-embedding-3-small';
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const response = await this.client.chat.completions.create({
      model: this.modelId,
      messages: this.mapMessages(request.messages),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      tools: request.tools?.map(this.mapTool),
      response_format: request.jsonMode ? { type: 'json_object' } : undefined
    });

    const choice = response.choices[0];
    return {
      id: response.id,
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(this.mapToolCall),
      stopReason: this.mapStopReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      model: response.model,
      latencyMs: Date.now() - startTime
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const response = await this.client.embeddings.create({
      model: request.model || this.embeddingModel,
      input: inputs
    });

    return {
      embeddings: response.data.map(d => d.embedding),
      model: response.model,
      usage: { totalTokens: response.usage.total_tokens }
    };
  }

  supportsTools(): boolean { return true; }
  supportsVision(): boolean { return true; }
  supportsStructuredOutput(): boolean { return true; }
  maxContextTokens(): number { return 128000; } // GPT-4o
  embeddingDimensions(): number | null { return 1536; } // text-embedding-3-small
}

// =============================================================================
// OLLAMA PROVIDER (Local)
// =============================================================================

class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly modelId: string;

  private baseUrl: string;

  constructor(config: OllamaConfig) {
    this.modelId = config.model || 'llama3.1:8b';
    this.baseUrl = config.endpoint || 'http://localhost:11434';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelId,
        messages: this.mapMessages(request.messages),
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens
        }
      })
    });

    if (!response.ok) {
      throw new AIProviderError(
        `Ollama request failed: ${response.status}`,
        'ollama',
        'INTERNAL_ERROR',
        true,
        response.status
      );
    }

    const data = await response.json();

    return {
      id: `ollama-${Date.now()}`,
      content: data.message.content,
      toolCalls: undefined, // Ollama tool support varies by model
      stopReason: 'end_turn',
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      },
      model: data.model,
      latencyMs: Date.now() - startTime
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const embeddings: number[][] = [];

    for (const text of inputs) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || 'nomic-embed-text',
          prompt: text
        })
      });

      const data = await response.json();
      embeddings.push(data.embedding);
    }

    return {
      embeddings,
      model: request.model || 'nomic-embed-text',
      usage: { totalTokens: 0 } // Ollama doesn't report token usage for embeddings
    };
  }

  supportsTools(): boolean { return false; } // Limited support
  supportsVision(): boolean { return false; } // Model-dependent
  supportsStructuredOutput(): boolean { return false; }
  maxContextTokens(): number { return 8192; } // Varies by model
  embeddingDimensions(): number | null { return 768; } // nomic-embed-text
}

// =============================================================================
// AI SERVICE IMPLEMENTATION
// =============================================================================

class AIServiceImpl implements AIService {
  private providers: Map<string, AIProvider>;
  private config: AIServiceConfig;
  private fallbackOrder: string[];

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.providers = new Map();
    this.fallbackOrder = config.fallbackOrder || ['claude', 'openai', 'ollama'];

    // Initialize configured providers
    if (config.claude?.enabled) {
      this.providers.set('claude', new ClaudeProvider(config.claude));
    }
    if (config.openai?.enabled) {
      this.providers.set('openai', new OpenAIProvider(config.openai));
    }
    if (config.ollama?.enabled) {
      this.providers.set('ollama', new OllamaProvider(config.ollama));
    }
  }

  async classifyIntent(
    message: string,
    context: ConversationContext
  ): Promise<IntentClassification> {
    const provider = this.getProvider(this.config.routing?.intentClassification);

    const response = await this.executeWithFallback(provider, async (p) => {
      return p.complete({
        systemPrompt: INTENT_CLASSIFICATION_PROMPT,
        messages: [
          ...this.buildContextMessages(context),
          { role: 'user', content: message }
        ],
        jsonMode: true,
        responseSchema: INTENT_CLASSIFICATION_SCHEMA,
        temperature: 0.1 // Low temperature for consistent classification
      });
    });

    return JSON.parse(response.content) as IntentClassification;
  }

  async generateResponse(
    message: string,
    context: ConversationContext
  ): Promise<GeneratedResponse> {
    const provider = this.getProvider(this.config.routing?.responseGeneration);

    // Retrieve relevant knowledge
    const knowledge = await this.retrieveKnowledge(message);

    const response = await this.executeWithFallback(provider, async (p) => {
      return p.complete({
        systemPrompt: this.buildSystemPrompt(context, knowledge),
        messages: [
          ...context.messages,
          { role: 'user', content: message }
        ],
        tools: this.getAvailableTools(context),
        temperature: 0.7
      });
    });

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      confidence: this.estimateConfidence(response),
      shouldEscalate: this.shouldEscalate(response),
      usage: response.usage
    };
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Always use embedding-capable provider (OpenAI or Ollama)
    const provider = this.getProvider(this.config.routing?.embedding || 'openai');

    const response = await provider.embed({ input: texts });
    return response.embeddings;
  }

  private async executeWithFallback<T>(
    preferredProvider: AIProvider,
    operation: (provider: AIProvider) => Promise<T>
  ): Promise<T> {
    const providers = [preferredProvider, ...this.getFallbackProviders(preferredProvider)];

    let lastError: AIProviderError | null = null;

    for (const provider of providers) {
      try {
        return await withRetry(
          () => operation(provider),
          DEFAULT_RETRY_CONFIG,
          { operationName: `${provider.name}.operation` }
        );
      } catch (error) {
        lastError = error as AIProviderError;
        console.warn(`Provider ${provider.name} failed, trying fallback...`, error);
      }
    }

    throw lastError || new Error('All providers failed');
  }
}
```

### Configuration Types

```typescript
interface AIServiceConfig {
  /** Provider configurations */
  claude?: ClaudeConfig;
  openai?: OpenAIConfig;
  ollama?: OllamaConfig;

  /** Order of providers for fallback */
  fallbackOrder?: string[];

  /** Route specific tasks to specific providers */
  routing?: {
    intentClassification?: string;
    responseGeneration?: string;
    embedding?: string;
    sentiment?: string;
  };

  /** Global retry configuration */
  retry?: RetryConfig;
}

interface ClaudeConfig {
  enabled: boolean;
  apiKey: string;
  model?: string;
  rateLimit?: RateLimitConfig;
}

interface OpenAIConfig {
  enabled: boolean;
  apiKey: string;
  model?: string;
  embeddingModel?: string;
  rateLimit?: RateLimitConfig;
}

interface OllamaConfig {
  enabled: boolean;
  endpoint?: string;
  model?: string;
  embeddingModel?: string;
}
```

## References

- [AI Engine Component](../c4-components/ai-engine.md)
- [Claude API Documentation](https://docs.anthropic.com/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
