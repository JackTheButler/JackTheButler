# Google Gemini AI Provider

> Phase: Planned
> Status: Not Started
> Priority: Medium
> Depends On: [AI Provider Integration Spec](../04-specs/ai/index.md)

## Overview

Jack currently supports Anthropic Claude, OpenAI, Ollama, and Local (Transformers.js) as AI providers. This feature adds Google Gemini as a fifth option, giving hotels access to Gemini's fast and cost-effective models including native embedding support via `text-embedding-004`. Hotels already using Google Workspace or GCP will find this a natural fit.

## Goals

1. **Full provider parity** — Gemini supports both completion and embeddings natively, no fallback required
2. **Dashboard-configurable** — Operators connect Gemini entirely through the app settings UI using an API key
3. **Model tier support** — Separate completion and utility models configurable independently
4. **Native embeddings** — `text-embedding-004` replaces the need for a secondary embedding provider when using Gemini

---

## Architecture

### Where It Lives

```
src/apps/ai/providers/
├── anthropic.ts     # Reference implementation
├── openai.ts
├── ollama.ts
├── local.ts
└── gemini.ts        # New file
```

Exports registered in `src/apps/ai/providers/index.ts`.

### How It Connects

```
Dashboard App Settings
    ↓ (operator enters API key)
AppRegistry.activate('gemini', config)
    ↓
manifest.createProvider(config)
    ↓
GeminiProvider implements AIProvider + BaseProvider
    ↓
├── complete()   → Gemini generateContent API → CompletionResponse
└── embed()      → Gemini embedContent API    → EmbeddingResponse
    ↓
MessageProcessor / KnowledgeBase use via registry
```

### SDK

Uses the official `@google/generative-ai` npm package. Install with:

```bash
pnpm add @google/generative-ai
```

---

## Core Concepts

### Role Mapping

Gemini uses `'model'` where Jack uses `'assistant'`. All outbound messages must be mapped before sending to the API:

```
Jack role       → Gemini role
────────────────────────────
'user'          → 'user'
'assistant'     → 'model'
'system'        → (extracted, passed as systemInstruction — not in messages array)
```

The system message must be extracted separately and passed as `systemInstruction` in the request, not as a message in `contents`. This matches the pattern documented in the [AI Provider Spec](../04-specs/ai/index.md#system-message-handling).

### Content Format

Gemini uses a `parts` array instead of a plain string for message content:

```typescript
// Jack's format
{ role: 'user', content: 'Hello' }

// Gemini's format
{ role: 'user', parts: [{ text: 'Hello' }] }
```

Map on the way out, extract on the way back:

```typescript
// Outbound
messages.map((m) => ({ role: mapRole(m.role), parts: [{ text: m.content }] }))

// Inbound
response.response.text()  // SDK helper extracts text from parts automatically
```

### Token Usage and Stop Reason

Gemini's response shape differs from Anthropic/OpenAI:

```typescript
// Token usage
response.usageMetadata.promptTokenCount      // → inputTokens
response.usageMetadata.candidatesTokenCount  // → outputTokens

// Stop reason
response.candidates[0].finishReason
// Values: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER'
// Map 'STOP' → 'end_turn', 'MAX_TOKENS' → 'max_tokens', others → value as-is
```

### Native Embeddings

Gemini supports embeddings via `text-embedding-004` (768 dimensions). Unlike Anthropic, this is a real semantic model and suitable for production knowledge base search.

```typescript
const result = await client.getGenerativeModel({ model: this.embeddingModel })
  .embedContent(request.text);

return {
  embedding: result.embedding.values,
  usage: { inputTokens: 0, outputTokens: 0 }, // Gemini does not report embedding token usage
};
```

> **Dimension note:** Gemini embeddings are 768-dimensional vs OpenAI's 1536. If switching from OpenAI to Gemini embeddings on an existing installation, all existing embeddings in the knowledge base must be regenerated. Document this as a breaking migration step in the release notes.

---

## Security

- **API key storage** — Stored encrypted in `app_configs` using the existing `ENCRYPTION_KEY` mechanism, same as Anthropic and OpenAI
- **Key scope** — The Gemini API key should be scoped to the Generative Language API only in Google Cloud Console
- **No logging** — API key must never appear in logs or error messages

---

## Admin Experience

### Setup Steps

1. Navigate to **Apps → AI** in the dashboard
2. Select **Google Gemini** from the provider list
3. Enter the **API Key** (from [Google AI Studio](https://aistudio.google.com/app/apikey))
4. Optionally select completion and utility models (defaults pre-filled)
5. Click **Test Connection** — verifies the key with a minimal API call
6. Save — Jack activates the Gemini provider

### Configuration Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `apiKey` | `password` | Yes | — | Google AI Studio API key |
| `model` | `select` | No | `gemini-2.0-flash` | Primary completion model |
| `utilityModel` | `select` | No | `gemini-2.0-flash` | Utility model for translation and classification |
| `embeddingModel` | `select` | No | `text-embedding-004` | Embedding model for knowledge base |
| `maxTokens` | `number` | No | `1024` | Max tokens per completion response |

### Model Options

| Model ID | Type | Notes |
|----------|------|-------|
| `gemini-2.0-flash` | Completion / Utility | Fast, cost-effective, recommended default |
| `gemini-2.0-pro` | Completion | Higher quality, slower and more expensive |
| `text-embedding-004` | Embedding | 768 dimensions, native semantic model |

---

## Key Differences from Other Providers

| | Anthropic | OpenAI | Gemini |
|---|---|---|---|
| SDK | `@anthropic-ai/sdk` | `openai` | `@google/generative-ai` |
| Message format | `role` + `content` | `role` + `content` | `role` + `parts: [{text}]` |
| `assistant` role name | `assistant` | `assistant` | `model` |
| System message | `system` param | First message `role: system` | `systemInstruction` param |
| Embedding support | ❌ (throws) | ✅ 1536-dim | ✅ 768-dim |
| Token usage fields | `input_tokens` / `output_tokens` | `prompt_tokens` / `completion_tokens` | `promptTokenCount` / `candidatesTokenCount` |

---

## What's NOT in Scope (Future)

- **Vertex AI** — Enterprise GCP-based Gemini access via `@google-cloud/vertexai`. Requires service account auth instead of API key. Separate provider if needed.
- **Multimodal input** — Gemini supports image and audio inputs. Jack's `CompletionMessage` is text-only; adding media support requires interface changes across all providers.
- **Grounding / Google Search** — Gemini can ground responses in live Google Search results. Out of scope for the hospitality use case.
- **Streaming** — The Gemini SDK supports streaming via `generateContentStream()`. Deferred until the core message processor uses streaming responses.

---

## Implementation Phases

### Phase 1: Core Provider

**Goal:** Gemini completion is working end-to-end and selectable from the dashboard.

Implement `GeminiProvider` class with `complete()`, `testConnection()`, and the manifest. Handle role mapping, system instruction extraction, content format conversion, and token/stop-reason mapping. Add `@google/generative-ai` dependency. Register in `index.ts`. Update the supported providers table in `docs/04-specs/ai/index.md`.

### Phase 2: Native Embeddings

**Goal:** Gemini can serve as the sole AI provider including knowledge base search.

Implement `embed()` using `text-embedding-004`. Set `capabilities.embedding: true` in the manifest. Add `embeddingModel` to the config schema. Document the 768-dimension difference and the re-indexing requirement for installations switching from OpenAI embeddings.

### Phase 3: Tests and Hardening

**Goal:** Gemini provider passes the same test coverage standard as Anthropic and OpenAI.

Write unit tests mirroring `tests/apps/ai/providers/anthropic.test.ts`. Cover: role mapping, system message extraction, content format conversion, token usage mapping, stop reason mapping, embedding output shape, `testConnection()` success and failure paths, missing API key guard. Mock the `@google/generative-ai` SDK.

---

## Known Issues to Resolve Before Implementation

The following issues were identified during planning review and must be addressed before implementation begins:

1. **SDK variable naming inconsistency in code examples** — The token usage section uses `response.usageMetadata` and `response.candidates[0]` (inner `GenerateContentResponse`), but the content format section uses `response.response.text()` (outer `GenerateContentResult`). These are two different objects and the examples mix them up. Fix all code examples to use consistent variable naming before a developer follows them.

2. **`systemInstruction` is set at model init, not per-request** — In `@google/generative-ai`, `systemInstruction` is passed to `getGenerativeModel()`, not to `generateContent()`. Since Jack's system prompt varies per conversation (guest profile, hotel config), the provider must create a new model instance on every `complete()` call rather than caching one at constructor time. The implementation plan must account for this.

3. **`gemini-2.0-pro` is an experimental model, not a stable alias** — As of planning, `gemini-2.0-pro` is only available as `gemini-2.0-pro-exp`. Using it as a default risks the same 404 deprecation issue seen with `claude-3-5-haiku-20241022`. Replace with stable aliases: `gemini-2.0-flash` (fast), `gemini-1.5-pro` (quality). Verify current model availability before implementation.

4. **Dimension mismatch silently corrupts knowledge base search** — `cosineSimilarity()` in `src/ai/knowledge/index.ts` returns `0` silently for mismatched vector dimensions. If an operator switches from OpenAI (1536-dim) to Gemini (768-dim) without re-indexing, all knowledge base searches silently return zero relevance and the AI loses all context. This is not just a release note — the implementation must either detect the mismatch on activation and warn the operator, or prevent activation if existing embeddings use a different dimension count.

5. **Test reference file does not exist** — Phase 3 references `tests/apps/ai/providers/anthropic.test.ts` but this file does not exist. Use `tests/apps/ai/providers/local.test.ts` as the structural reference instead.

6. **`Depends On` field links to a spec, not a roadmap phase** — Remove the `Depends On` line or replace it with a note that there are no roadmap-level dependencies. The AI spec is a reference document, not a prerequisite feature.

7. **Phase structure should be consolidated** — Phases 1 (completion) and 2 (embeddings) are both in the same single file and should ship together. Split into two phases only: Phase 1 (full provider — completion + embeddings), Phase 2 (tests and hardening). This matches how other single-file providers would be structured.

---

## Related Documents

- [AI Provider Integration Spec](../04-specs/ai/index.md) — Interface contracts, patterns, and config schema reference
- [Anthropic Provider](../../src/apps/ai/providers/anthropic.ts) — Reference implementation
- [Knowledge Base Spec](../04-specs/features/knowledge-base.md) — How embeddings feed into RAG search
