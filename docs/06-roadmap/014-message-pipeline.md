# Message Pipeline Refactor

> Phase: Planned
> Status: Not Started
> Priority: High
> Depends On: None

## Overview

Refactor the message processing pipeline from a monolithic function with local variables into a structured context object that flows through discrete, composable stages. Each stage reads what it needs from the context and writes what it produces — similar to how Koa, LangChain LCEL, and Microsoft Semantic Kernel handle multi-step processing pipelines.

This is an architectural refactor. It does not change what the system does — it changes how the pipeline is structured internally, making it significantly easier to extend, test, observe, and reason about.

## Goals

1. **Single context object** — all pipeline state lives in one typed object, eliminating scattered local variables and long parameter lists
2. **Composable stages** — each stage is a standalone function `(ctx: MessageContext) => Promise<void>`, independently testable
3. **Shared computed values** — values like embeddings are computed once in the pipeline and read by any downstream stage with no duplication
4. **Observability** — the full pipeline state is inspectable at any point for debugging and logging
5. **Extensibility** — new stages (memory recall, sentiment analysis, etc.) are added by inserting a function into the pipeline array, with no changes to existing stages

## Key Features

### Developer-Facing

1. **`MessageContext` type** — a single typed interface that documents everything the pipeline knows at each stage
2. **Stage functions** — each processing step is a named, exported function that can be unit tested in isolation by injecting a partial context
3. **Pipeline runner** — a simple executor that runs stages in order, with error handling and timing per stage
4. **Short-circuit support** — a stage can set `ctx.done = true` to stop the pipeline early (e.g. approval required)

---

## Architecture

### Where it lives

```
src/
  core/
    pipeline/
      context.ts        # MessageContext interface + factory (internal only)
      runner.ts         # Pipeline executor
      stages/
        identify-guest.ts
        resolve-conversation.ts
        load-guest-context.ts
        detect-language.ts
        save-inbound-message.ts
        generate-response.ts      # Stage 2: black box call to responder
        compute-embedding.ts      # Stage 3: extracted from responder internals
        search-knowledge.ts       # Stage 3: extracted from responder internals
        route-task.ts
        check-escalation.ts
        check-autonomy.ts
        translate-response.ts
        save-outbound-message.ts
    message-processor.ts  # Existing file — outer try/catch/finally stays here
```

> **Note:** `MessageContext` is an internal kernel type. It does not belong in `@jack/shared` — that package is for plugin authors (AI, channel, PMS adapters) who never interact with the pipeline directly.

### How it connects (after Stage 3)

```
InboundMessage
      ↓
createContext(inbound)       → MessageContext (initial state)
      ↓
pipeline runner
  [identifyGuest]            → ctx.guest
  [resolveConversation]      → ctx.conversation, ctx.propertyLanguage
  [loadGuestContext]         → ctx.guestContext
  [detectLanguage]           → ctx.detectedLanguage, ctx.translatedContent
  [saveInboundMessage]       → ctx.savedInboundId  (side effect)
  [computeEmbedding]         → ctx.queryEmbedding   ← computed ONCE
  [searchKnowledge]          → ctx.knowledgeResults  (reads ctx.queryEmbedding)
  [generateResponse]         → ctx.response          (reads ctx.knowledgeResults)
  [routeTask]                → ctx.taskCreated       (side effect)
  [checkEscalation]          → ctx.escalated         (side effect)
  [checkAutonomy]            → ctx.done = true + ctx.pendingResponse if approval needed
  [translateResponse]        → ctx.translatedResponse
  [saveOutboundMessage]      → ctx.savedOutboundId   (side effect)
      ↓
buildOutboundMessage(ctx)    → OutboundMessage

Error handling + activity logging stay in MessageProcessor.process() try/catch/finally
(not in the runner — the runner stays minimal)
```

---

## Core Concepts

### MessageContext

The central type. Created at the start of `process()` and passed to every stage. Stages read from it and write to it. Nothing is passed as a function parameter except `ctx`.

```typescript
export interface MessageContext {
  // ── Input ───────────────────────────────────────────────
  inbound: InboundMessage;
  startTime: number;

  // ── Guest identification ─────────────────────────────────
  guest?: Guest;

  // ── Conversation ─────────────────────────────────────────
  conversation?: Conversation;
  propertyLanguage?: string;

  // ── Guest context (profile + reservation) ────────────────
  guestContext?: GuestContext;

  // ── Language ─────────────────────────────────────────────
  detectedLanguage?: string;
  translatedContent?: string;   // inbound translated to property language

  // ── Persistence ──────────────────────────────────────────
  savedInboundId?: string;
  savedOutboundId?: string;

  // ── Embedding (computed once, shared by all consumers) ────
  queryEmbedding?: number[];    // added in Stage 3

  // ── Knowledge ────────────────────────────────────────────
  knowledgeResults?: KnowledgeSearchResult[];  // added in Stage 3

  // ── AI response ──────────────────────────────────────────
  response?: AIResponse;

  // ── Post-processing ──────────────────────────────────────
  escalated?: boolean;
  taskCreated?: boolean;
  translatedResponse?: string;  // response translated to guest language

  // ── Pipeline control ─────────────────────────────────────
  done?: boolean;               // set to true to stop pipeline early
  pendingResponse?: OutboundMessage;  // set by checkAutonomy when approval required

  // ── Outcome (for activity logging in finally block) ───────
  outcome?: 'success' | 'failed';
  outcomeDetails?: Record<string, unknown>;
}

export function createContext(inbound: InboundMessage): MessageContext {
  return { inbound, startTime: Date.now() };
}
```

### Stage Functions

Each stage is a named async function with the signature `(ctx: MessageContext) => Promise<void>`. It reads what it needs from `ctx` and writes its outputs back to `ctx`.

```typescript
// Example: detect-language.ts
export async function detectLanguage(ctx: MessageContext): Promise<void> {
  if (!ctx.conversation) return;
  try {
    const result = await detectAndTranslate(ctx.inbound.content, ctx.propertyLanguage ?? 'en');
    ctx.detectedLanguage = result.detectedLanguage;
    ctx.translatedContent = result.translatedContent ?? undefined;
  } catch (err) {
    log.warn({ err }, 'Language detection failed');
  }
}

// Example: check-autonomy.ts (Stage 2)
export async function checkAutonomy(ctx: MessageContext): Promise<void> {
  if (!ctx.response) return;
  const result = await handleAutonomyCheck(ctx.response, ctx.conversation!, ctx.guestContext, ctx.detectedLanguage, ctx.propertyLanguage!);
  if (result) {
    ctx.pendingResponse = result.pendingResponse;
    ctx.done = true;  // stop pipeline — no translation or outbound save needed
  }
}
```

### Pipeline Runner

A minimal executor that runs stages in sequence and re-throws on failure. Error handling and activity logging stay in `MessageProcessor.process()`.

```typescript
// runner.ts
export async function runPipeline(
  ctx: MessageContext,
  stages: Array<(ctx: MessageContext) => Promise<void>>
): Promise<MessageContext> {
  for (const stage of stages) {
    if (ctx.done) break;
    await stage(ctx);  // let errors propagate — caught by MessageProcessor
  }
  return ctx;
}
```

### Replacing message-processor.ts

The existing `process()` method becomes a thin wrapper. The try/catch/finally for error events and activity logging stays in the wrapper — it is not a pipeline stage.

```typescript
async process(inbound: InboundMessage): Promise<OutboundMessage> {
  const ctx = createContext(inbound);
  try {
    await runPipeline(ctx, [
      identifyGuest,
      resolveConversation,
      loadGuestContext,
      detectLanguage,
      saveInboundMessage,
      // Stage 3 inserts computeEmbedding + searchKnowledge here
      generateResponse,   // Stage 2: black box; Stage 3: reads ctx.knowledgeResults
      routeTask,
      checkEscalation,
      checkAutonomy,
      translateResponse,
      saveOutboundMessage,
    ]);
    ctx.outcome = 'success';
    ctx.outcomeDetails = { ... };
    return ctx.pendingResponse ?? buildOutboundMessage(ctx);
  } catch (err) {
    ctx.outcome = 'failed';
    events.emit({ type: EventTypes.MESSAGE_FAILED, ... });
    throw err;
  } finally {
    writeActivityLog(..., ctx.outcome, ctx.outcomeDetails);
  }
}
```

---

## What's NOT in Scope (Future)

- **Parallel stage execution** — stages that don't depend on each other (knowledge search + memory recall) are out of scope for v1; sequential is correct and simpler
- **Stage middleware** — wrapping stages with cross-cutting concerns is deferred; the runner stays minimal
- **Dynamic pipeline configuration** — selecting stages based on channel type is deferred

---

## Data Model

No database changes. This is a pure code refactor — same inputs, same outputs, same side effects. The `MessageContext` is an in-memory object that never persists.

---

## Implementation Stages

### Stage 1 — Define `MessageContext` and pipeline runner

**Goal:** The context type and runner exist and are tested. No existing code is changed.

Create `src/core/pipeline/context.ts` with the `MessageContext` interface and `createContext()`. Create `src/core/pipeline/runner.ts` with `runPipeline()`. Write unit tests for the runner: correct order, short-circuit on `ctx.done`, error propagation.

**Testable:** Runner unit tests pass. No existing code is changed.

---

### Stage 2 — Extract stages from `message-processor.ts`

**Goal:** Each logical block in `process()` and the three private methods becomes a named stage function. `message-processor.ts` calls `runPipeline()` with identical behaviour.

Extract the 11 stages that exist today in `message-processor.ts`. The `generateResponse` stage calls `defaultResponder.generate()` (the module-level singleton from `src/ai/index.ts`) — the responder internals are not touched in this stage. For unit testing individual stages, tests pre-populate `ctx.response` directly and skip the `generateResponse` stage entirely, which is cleaner than constructor injection. Add `ctx.pendingResponse` to `MessageContext` so `checkAutonomy` can set it before `ctx.done = true`. Keep the try/catch/finally for error events and activity logging in `MessageProcessor.process()` — not in the runner.

**Testable:** Full test suite passes. Send a real message end-to-end — same response, same DB state, same events emitted.

---

### Stage 3 — Extract `responder.generate()` internal stages

**Goal:** The internal steps of `responder.generate()` (embedding + knowledge search + LLM call) become pipeline stages, making `ctx.queryEmbedding` and `ctx.knowledgeResults` explicit pipeline outputs.

This stage requires two prerequisite changes before extracting stages:
1. **Expose `KnowledgeService.searchByEmbedding()`** — today `knowledge.search()` computes the embedding internally. A new `searchByEmbedding(embedding: number[], opts)` method is needed so the pipeline can pass a pre-computed embedding.
2. **Update the `Responder` interface** — `generateResponse` stage will pass `ctx.knowledgeResults` into the responder instead of letting it re-fetch. The `Responder.generate()` signature changes to accept pre-computed knowledge results, or the `AIResponder` is restructured into sub-functions callable directly from stages.

Once those are in place, insert `computeEmbedding` and `searchKnowledge` stages before `generateResponse`, and update `generateResponse` to read from `ctx`.

**Testable:** Inject a `MessageContext` with a pre-set `queryEmbedding` — assert `searchKnowledge` skips the embed call. Integration test confirms exactly one embed call per message.

---

### Stage 4 — Per-stage observability

**Goal:** Each stage's execution time and output keys are logged at debug level.

Extend the runner to log `{ stage, durationMs }` after each stage. No new infrastructure — uses the existing logger.

**Testable:** Enable debug logging, send a message, assert log output contains a timed entry for each stage in order.

---

## Related Documents

- [Guest Memory](./015-guest-memory.md) — the first feature to benefit from this pipeline; memory recall becomes a stage that reads `ctx.queryEmbedding` with no extra embed call
