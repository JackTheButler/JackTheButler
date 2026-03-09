# AI Provider Integration

AI provider adapter interface and implementation guide.

---

## Overview

Jack uses AI providers for:
- **Completion** — Generating guest responses and conversation handling
- **Utility** — Translation, intent classification, and search queries
- **Embeddings** — Vector search for the knowledge base

All providers implement a common interface defined in `src/core/interfaces/ai.ts`. Business logic depends only on this interface, not on specific providers.

---

## Supported Providers

| Provider | App ID | Completion | Embeddings | Status |
|----------|--------|-----------|------------|--------|
| Anthropic Claude | `anthropic` | ✅ | ⚠️ Hash fallback only | Implemented |
| OpenAI GPT | `openai` | ✅ | ✅ | Implemented |
| Ollama | `ollama` | ✅ | ✅ | Implemented |
| Local (Transformers.js) | `local` | ✅ | ✅ | Implemented |
| Google Gemini | — | — | — | Planned |

> **Note:** Anthropic does not have a native embeddings API. The Anthropic provider falls back to a deterministic hash-based embedding (not a real model — unsuitable for production vector search). For production knowledge base search, use OpenAI, Ollama, or Local as the provider, or pair Anthropic completion with a separate embedding provider.

---

## Provider Interface

Every provider must implement two interfaces from `src/core/interfaces/ai.ts` and `src/apps/types.ts`:

```typescript
// Core AI capability — business logic depends on this
interface AIProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

// Infrastructure — connection testing and identity
interface BaseProvider {
  readonly id: string;
  testConnection(): Promise<ConnectionTestResult>;
}
```

`testConnection()` returns a `ConnectionTestResult`:

```typescript
interface ConnectionTestResult {
  success: boolean;
  message: string;           // Human-readable status shown in dashboard
  details?: Record<string, unknown>;
  latencyMs?: number;
}
```

For cloud providers, test by making a minimal real API call (e.g. a short completion). Do not just check if a key is present — actually verify it works.

### CompletionMessage

```typescript
type MessageRole = 'system' | 'user' | 'assistant';

interface CompletionMessage {
  role: MessageRole;
  content: string;
}
```

### CompletionRequest

```typescript
interface CompletionRequest {
  messages: CompletionMessage[];       // Includes system prompt as first message
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  modelTier?: 'completion' | 'utility'; // Defaults to 'completion'
}
```

### System Message Handling

The first message in `messages` may have `role: 'system'`. Many APIs (e.g. Anthropic, Gemini) treat this separately from the conversation. The standard pattern is:

```typescript
const systemMessage = request.messages.find((m) => m.role === 'system');
const conversationMessages = request.messages.filter((m) => m.role !== 'system');

// Then pass systemMessage.content to the API's system/instruction field
// and conversationMessages as the conversation history
```

APIs that do not have a dedicated system field (e.g. some Gemini configurations) should prepend it to the first user message or use the API's equivalent.

### Model Tiers

Each provider supports two model tiers selected per-request:

| Tier | Purpose | Example (Anthropic) | Example (OpenAI) |
|------|---------|---------------------|-----------------|
| `completion` | Guest responses, reasoning | `claude-sonnet-4-6` | `gpt-4o` |
| `utility` | Translation, classification, search | `claude-haiku-4-5-20251001` | `gpt-4o-mini` |

```typescript
const model = request.modelTier === 'utility' ? this.utilityModel : this.model;
```

If `utilityModel` is not configured, fall back to the completion model:
```typescript
this.utilityModel = config.utilityModel || this.model;
```

Pass `modelTier: 'utility'` for lightweight tasks to reduce cost and latency.

### CompletionResponse

```typescript
interface CompletionResponse {
  content: string;           // Plain text response only — no role wrapper
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason?: string;       // e.g. 'end_turn', 'max_tokens'
}
```

### EmbeddingRequest / EmbeddingResponse

```typescript
interface EmbeddingRequest {
  text: string;
}

interface EmbeddingResponse {
  embedding: number[];   // Normalized vector
  usage?: TokenUsage;
}
```

If the provider does not support embeddings, set `capabilities.embedding: false` in the manifest and throw from `embed()`:

```typescript
async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
  throw new Error('YourProvider does not support embeddings. Use OpenAI, Ollama, or Local.');
}
```

Do **not** return a fake/hash embedding — it will silently corrupt knowledge base search results.

---

## App Manifest

Every provider exports a manifest conforming to `AIAppManifest` from `src/apps/types.ts`:

```typescript
export const manifest: AIAppManifest = {
  id: 'your-provider',          // Unique app ID, e.g. 'gemini'
  name: 'Display Name',
  category: 'ai',
  version: '1.0.0',
  description: 'Short description',
  icon: '🤖',
  docsUrl: 'https://...',
  configSchema: [...],          // Fields shown in the dashboard
  capabilities: {
    completion: true,
    embedding: true,            // Set false if not supported — triggers throw in embed()
    streaming: false,           // Only set true if streaming is actually implemented
  },
  createProvider: (config) => createYourProvider(config),
};
```

> **Streaming note:** Only set `streaming: true` if `complete()` actually streams. The capability is declared in the manifest but not yet used by the core — set it accurately for future use.

---

## Implementing a New Provider

Use `src/apps/ai/providers/anthropic.ts` as the reference implementation.

### 1. Create the provider file

```
src/apps/ai/providers/your-provider.ts
```

### 2. Define the config interface and implement the class

```typescript
export interface YourProviderConfig {
  apiKey: string;
  model?: string;
  utilityModel?: string;
  maxTokens?: number;
}

export class YourProvider implements AIProvider, BaseProvider {
  readonly id = 'your-provider';
  readonly name = 'your-provider';

  private model: string;
  private utilityModel: string;
  private maxTokens: number;

  constructor(config: YourProviderConfig) {
    // Always guard against missing API key in the constructor
    if (!config.apiKey) {
      throw new Error('YourProvider requires an API key');
    }

    this.model = config.model || 'default-model-alias';
    this.utilityModel = config.utilityModel || this.model;
    this.maxTokens = config.maxTokens || 1024;
  }

  async testConnection(): Promise<ConnectionTestResult> { ... }
  async complete(request: CompletionRequest): Promise<CompletionResponse> { ... }
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> { ... }
}
```

### 3. Handle model tiers and system message in `complete()`

```typescript
async complete(request: CompletionRequest): Promise<CompletionResponse> {
  const model = request.modelTier === 'utility' ? this.utilityModel : this.model;
  const systemMessage = request.messages.find((m) => m.role === 'system');
  const conversationMessages = request.messages.filter((m) => m.role !== 'system');

  // Call your API with model, systemMessage.content, and conversationMessages
  // Map the response to CompletionResponse shape
}
```

### 4. Export the manifest

`createProvider` receives `Record<string, unknown>` — cast it to your typed config:

```typescript
export function createYourProvider(config: YourProviderConfig): YourProvider {
  return new YourProvider(config);
}

export const manifest: AIAppManifest = {
  id: 'your-provider',
  category: 'ai',
  // ...
  createProvider: (config) => createYourProvider(config as unknown as YourProviderConfig),
};
```

### 5. Register in the index

Add exports to `src/apps/ai/providers/index.ts`:

```typescript
export {
  YourProvider,
  createYourProvider,
  manifest as yourProviderManifest,
  type YourProviderConfig,
} from './your-provider.js';
```

---

## Model Versioning

**Use aliases, not dated snapshots** — dated model IDs (e.g. `claude-sonnet-4-20250514`) can be deprecated and will return 404. Aliases (e.g. `claude-sonnet-4-6`, `gpt-4o`) always resolve to the latest version of that model.

### Current model IDs

| Provider | Completion | Utility | Embedding |
|----------|-----------|---------|-----------|
| Anthropic | `claude-sonnet-4-6` | `claude-haiku-4-5-20251001`* | — (hash fallback) |
| OpenAI | `gpt-4o` | `gpt-4o-mini` | `text-embedding-3-small` |
| Ollama | `llama3.1` (default) | Same as completion | `nomic-embed-text` (default) |
| Local | `onnx-community/Llama-3.2-1B-Instruct-ONNX` (default) | Same as completion | `Xenova/all-MiniLM-L6-v2` |

*Haiku 4.5 has no undated alias yet — update when `claude-haiku-4-6` is published.

---

## Configuration Schema Fields

Not all fields apply to every provider. The table below shows which providers support each field:

| Field | Type | Anthropic | OpenAI | Ollama | Local | Description |
|-------|------|-----------|--------|--------|-------|-------------|
| `apiKey` | `password` | ✅ Required | ✅ Required | — | — | Provider API key |
| `model` | `select` | ✅ | ✅ | — | — | Completion model (select from fixed list) |
| `completionModel` | `select` | — | — | — | ✅ | Completion model for Local provider |
| `utilityModel` | `select` | ✅ | ✅ | — | ✅ | Utility model, falls back to completion model if unset |
| `utilityModel` | `text` | — | — | ✅ | — | Utility model for Ollama (free text, not a fixed list) |
| `embeddingModel` | `select` | — | ✅ | — | ✅ | Embedding model |
| `embeddingModel` | `text` | — | — | ✅ | — | Embedding model for Ollama (free text) |
| `maxTokens` | `number` | ✅ (default: 1024) | ✅ (default: 1024) | — | — | Max tokens per response |
| `baseUrl` | `text` | — | ✅ | ✅ Required | — | API or server base URL |

> **Ollama note:** Model fields use `text` input (not `select`) because models are user-installed locally and not from a fixed list. `baseUrl` defaults to `http://localhost:11434`.

> **Local note:** The completion model config key is `completionModel` (not `model`). Models are downloaded from Hugging Face on first use and cached locally — the first `testConnection()` call triggers the download.

---

## Related

- [AI Provider Interface](../../../src/core/interfaces/ai.ts) — TypeScript interface
- [Anthropic Provider](../../../src/apps/ai/providers/anthropic.ts) — Reference implementation
- [App Registry](../../03-architecture/decisions/002-app-registry-pattern.md) — How providers are loaded
- [Knowledge Base](../features/knowledge-base.md) — How embeddings are used
