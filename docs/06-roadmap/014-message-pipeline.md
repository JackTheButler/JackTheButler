# Message Pipeline Refactor

> Phase: Complete
> Status: Done
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

1. **`MessageContext` type** — a single typed interface that documents everything the pipeline knows at each stage
2. **Stage functions** — each processing step is a named, exported function that can be unit tested in isolation by injecting a partial context
3. **`runPipeline()`** — a simple loop in `context.ts` that runs stages in order and short-circuits on `ctx.done`

---

## Architecture

### Where it lives

```
src/
  core/
    pipeline/
      context.ts        # MessageContext interface + createContext() + runPipeline()
      stages/
        identify-guest.ts
        resolve-conversation.ts
        load-guest-context.ts
        detect-language.ts
        save-inbound-message.ts
        generate-response.ts      # Stage 2: black box call to defaultResponder
        compute-embedding.ts      # Stage 3: extracted from responder internals
        search-knowledge.ts       # Stage 3: extracted from responder internals
        route-task.ts
        check-escalation.ts
        check-autonomy.ts
        translate-response.ts
        save-outbound-message.ts
      index.ts          # Orchestrator — stage order + try/catch/finally (replaces message-processor.ts)
```

> **Note:** `MessageContext` is an internal kernel type. It does not belong in `@jackthebutler/shared` — that package is for plugin authors (AI, channel, PMS adapters) who never interact with the pipeline directly.

### How it connects (after Stage 3)

```
InboundMessage
      ↓
createContext(inbound)       → MessageContext { inbound, startTime }
      ↓
runPipeline(ctx, stages)
  [identifyGuest]            → ctx.guest
  [resolveConversation]      → ctx.conversation, ctx.propertyLanguage
  [loadGuestContext]         → ctx.guestContext
  [detectLanguage]           → ctx.detectedLanguage, ctx.translatedContent
  [saveInboundMessage]       → ctx.savedInboundId  (side effect)
  [computeEmbedding]         → ctx.queryEmbedding   ← computed ONCE (Stage 3)
  [searchKnowledge]          → ctx.knowledgeResults  (Stage 3)
  [generateResponse]         → ctx.aiResponse
  [routeTask]                → ctx.taskCreated       (side effect)
  [checkEscalation]          → ctx.escalated         (side effect)
  [checkAutonomy]            → ctx.done = true + ctx.outbound if approval needed
  [translateResponse]        → ctx.translatedResponse
  [saveOutboundMessage]      → ctx.outbound, ctx.savedOutboundId
      ↓
return ctx.outbound

Error handling + activity logging stay in MessageProcessor.process() try/catch/finally
```

---

## Core Concepts

### MessageContext

The central type. Created at the start of `process()` and passed through every stage. Stages read from it and write to it.

```typescript
export interface MessageContext {
  // ── Input ───────────────────────────────────────────────
  inbound: InboundMessage;
  startTime: number;

  // ── Guest ────────────────────────────────────────────────
  guest?: Guest;
  guestContext?: GuestContext;

  // ── Conversation ─────────────────────────────────────────
  conversation?: Conversation;
  propertyLanguage?: string;

  // ── Language ─────────────────────────────────────────────
  detectedLanguage?: string;
  translatedContent?: string;   // inbound translated to property language

  // ── Persistence ──────────────────────────────────────────
  savedInboundId?: string;
  savedOutboundId?: string;

  // ── Embedding + Knowledge (Stage 3) ──────────────────────
  queryEmbedding?: number[];
  knowledgeResults?: KnowledgeSearchResult[];

  // ── AI response ──────────────────────────────────────────
  aiResponse?: AIResponse;
  translatedResponse?: string;

  // ── Post-processing flags ─────────────────────────────────
  escalated?: boolean;
  taskCreated?: boolean;

  // ── Pipeline control ─────────────────────────────────────
  done?: boolean;           // set to true to stop pipeline early

  // ── Final output ─────────────────────────────────────────
  outbound?: OutboundMessage;   // set by saveOutboundMessage or checkAutonomy

  // ── Outcome (for activity logging in finally block) ───────
  outcome?: 'success' | 'failed';
  outcomeDetails?: Record<string, unknown>;
}

export function createContext(inbound: InboundMessage): MessageContext {
  return { inbound, startTime: Date.now() };
}

export async function runPipeline(
  ctx: MessageContext,
  stages: Array<(ctx: MessageContext) => Promise<void>>
): Promise<void> {
  for (const stage of stages) {
    if (ctx.done) break;
    await stage(ctx);
  }
}
```

### Stage Functions

Each stage is a named async function: `(ctx: MessageContext) => Promise<void>`. It reads what it needs from `ctx` and writes its result back.

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

// Example: check-autonomy.ts
export async function checkAutonomy(ctx: MessageContext): Promise<void> {
  if (!ctx.aiResponse) return;
  const result = await evaluateAutonomy(ctx.aiResponse, ctx.conversation!, ctx.guestContext, ctx.detectedLanguage, ctx.propertyLanguage!);
  if (result) {
    ctx.outbound = result.pendingOutbound;
    ctx.done = true;  // stop pipeline — skip translation and outbound save
  }
}
```

### Replacing message-processor.ts

`src/core/message-processor.ts` is deleted. Its responsibility moves to `src/core/pipeline/index.ts` as a plain exported function — no class, no singleton. The outer try/catch/finally for error events and activity logging lives here, not inside the pipeline runner.

Callers update from `messageProcessor.process(inbound)` → `processMessage(inbound)`.

```typescript
// src/core/pipeline/index.ts
export async function processMessage(inbound: InboundMessage): Promise<OutboundMessage> {
  const ctx = createContext(inbound);
  try {
    await runPipeline(ctx, [
      identifyGuest,
      resolveConversation,
      loadGuestContext,
      detectLanguage,
      saveInboundMessage,
      // Stage 3 inserts computeEmbedding + searchKnowledge here
      generateResponse,
      routeTask,
      checkEscalation,
      checkAutonomy,
      translateResponse,
      saveOutboundMessage,
    ]);
    ctx.outcome = 'success';
    return ctx.outbound!;
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

### Stage 1 — Define `MessageContext` and `runPipeline` ✓

**Goal:** The context type and runner exist and are tested. No existing code is changed.

Create `src/core/pipeline/context.ts` with `MessageContext`, `createContext()`, and `runPipeline()`. Write unit tests: stages run in order, short-circuit on `ctx.done`, errors propagate.

**Testable:** Unit tests pass. No existing code is changed.

---

### Stage 2 — Extract stages from `message-processor.ts` ✓

**Goal:** Each logical block in `process()` and the three private methods becomes a named stage function. `message-processor.ts` calls `runPipeline()` with identical behaviour.

Delete `src/core/message-processor.ts` and create `src/core/pipeline/index.ts` in its place — a plain `processMessage()` function with no class or singleton. Extract the 11 logical blocks into named stage files under `stages/`. The `generateResponse` stage calls `defaultResponder` (the module-level singleton from `src/ai/index.ts`) as a black box — the responder internals are not touched. The try/catch/finally for error events and activity logging lives in `pipeline/index.ts`, not in the runner. Update `src/core/index.ts` and the 3 callers (webchat, SMS webhook, WhatsApp webhook) to import `processMessage` from the new location.

**Testable:** Full test suite passes. End-to-end message produces same response, same DB state, same events.

---

### Stage 3 — Extract `responder.generate()` internal stages ✓

**Goal:** Embedding and knowledge search become explicit pipeline stages, making `ctx.queryEmbedding` and `ctx.knowledgeResults` visible outputs.

Two prerequisite changes required:
1. **Expose `KnowledgeService.searchByEmbedding()`** — today `knowledge.search()` computes the embedding internally. A new method accepting a pre-computed embedding is needed.
2. **Update the `Responder` interface** — `generateResponse` stage passes `ctx.knowledgeResults` in instead of letting the responder re-fetch. The signature changes or `AIResponder` is restructured into sub-functions callable directly from stages.

Once in place, insert `computeEmbedding` and `searchKnowledge` before `generateResponse`, and update `generateResponse` to read from `ctx`.

**Testable:** Pre-set `ctx.queryEmbedding` — assert `searchKnowledge` skips the embed call. Integration test confirms exactly one embed call per message.

---

### Stage 4 — Per-stage observability ✓

**Goal:** Each stage's execution time is logged at debug level.

Extend `runPipeline()` to log `{ stage, durationMs }` after each stage using the existing logger.

**Testable:** Enable debug logging, send a message, assert log contains a timed entry for each stage in order.

---

## Related Documents

- [Guest Memory](./015-guest-memory.md) — the first feature to benefit from this pipeline; memory recall becomes a stage that reads `ctx.queryEmbedding` with no extra embed call
