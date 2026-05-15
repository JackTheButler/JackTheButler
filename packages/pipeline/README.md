# @jackthebutler/pipeline

Domain-agnostic message-processing pipeline for AI assistants. Used by Jack The Butler for hospitality; designed to be reused for other verticals (trading, handyman, car dealer, …) without changes to the pipeline code itself.

The package provides:

- A configurable pipeline runtime (`createPipeline`)
- 12 reference stages covering the full inbound → AI response → outbound flow
- A small, opinionated set of contracts the consumer implements

You provide the **what** (your domain's intents, prompts, entity model) and the **how** (your AI provider, storage, logger). The package provides the **flow**.

## Install

This is a workspace package. Add as a dependency:

```jsonc
{
  "dependencies": {
    "@jackthebutler/pipeline": "workspace:*"
  }
}
```

## Quick start

```typescript
import { createPipeline } from '@jackthebutler/pipeline';

const pipeline = createPipeline({
  intents: new MyIntentProvider(),         // domain catalog
  prompts: new MyPromptProvider(),         // domain prompts
  services: {
    entities:     new MyEntityProvider(),
    ai:           new MyAIProvider(),
    conversation: new MyConversationProvider(),
    logger:       pino(),
    // knowledge:   new MyKnowledgeProvider(),   // optional
    // memory:      new MyMemoryProvider(),      // optional
  },
  // systemLanguage: 'en',                       // optional, defaults to 'en'
  // stages: customStages,                       // optional, defaults to all 12
});

const response = await pipeline.process({
  id: 'msg-123',
  channel: 'whatsapp',
  channelId: '+15551234567',
  content: 'Can I get extra towels?',
  createdAt: new Date(),
});
// → { id, conversationId, content, createdAt, metadata? }
```

## What you implement

The pipeline depends on **6 required + 2 optional** contracts.

### Required

| Contract | Methods | What it does |
|---|---|---|
| `IntentProvider` | `list()`, `get(name)` | Returns the catalog of intents your classifier can pick from. |
| `PromptProvider` | `classifier(intents)`, `responder(input)`, `detector()`, `translator(from, to)` | Returns the 4 system prompts your domain uses. |
| `EntityProvider` | `resolve(inbound)`, `findById(id)` | Resolves the "user" for an inbound message. |
| `AIProvider` | `complete(req)`, `embed(req)` | Wraps your LLM provider (Anthropic, OpenAI, Bedrock, Ollama, …). |
| `ConversationProvider` | `findOrCreate`, `findById`, `addMessage`, `getRecentMessages` | Conversation persistence. |
| `Logger` | `debug`, `info`, `warn`, `error` | Pino-style structured logging. |

### Optional

| Contract | When you need it |
|---|---|
| `KnowledgeProvider` | If you want RAG. Adds `searchKnowledge` to the pipeline. |
| `MemoryProvider` | If you want long-term per-user memory. Adds `recallMemories`. |

Optional services that are missing cause their dependent stages to silently no-op, so you can opt into features incrementally.

## The pipeline

12 stages run in this order by default:

```
1.  resolveConversation       — who is this, where are we
2.  detectLanguage            — BCP-47 code of the inbound
3.  translateInbound          — translate to systemLanguage (skip if same)
4.  loadHistory               — load recent turns for context
5.  saveInboundMessage        — persist what they said
6.  classifyIntent            — match the intent from the catalog
7.  computeEmbedding          — embed for retrieval (skip if no KB+memory)
8.  searchKnowledge           — RAG search (skip if no KB)
9.  recallMemories            — memory recall (skip if no memory)
10. generateResponse          — LLM call with full context
11. translateOutbound         — translate back (skip if same)
12. saveOutboundMessage       — persist response; build OutboundMessage
```

Every conditional stage no-ops cleanly when its inputs/services are missing, so the same defaults work for a single-language minimal deployment and a full multi-language RAG + memory deployment.

## Customizing stages

```typescript
import {
  createPipeline,
  defaultStages,
  saveInboundMessage,
} from '@jackthebutler/pipeline';

// 1. Replace entirely
createPipeline({
  /* ... */
  stages: [resolveConversation, generateResponse, saveOutboundMessage],
});

// 2. Append a custom stage
createPipeline({
  /* ... */
  stages: [...defaultStages, myCustomTelemetryStage],
});

// 3. Remove a specific stage
createPipeline({
  /* ... */
  stages: defaultStages.filter((s) => s !== saveInboundMessage),
});

// 4. Insert a stage at a specific position
createPipeline({
  /* ... */
  stages: [
    ...defaultStages.slice(0, 4),
    myCustomStage,
    ...defaultStages.slice(4),
  ],
});
```

A custom stage is just `async (ctx, env) => { … }`. Read/write `ctx`, optionally short-circuit by setting `ctx.done = true`.

## Error handling

`pipeline.process()` throws when:
- A stage throws an unhandled error
- The pipeline completes without producing an outbound message

The package has no built-in retry / fallback machinery. Callers wrap with `try/catch`:

```typescript
try {
  const response = await pipeline.process(inbound);
  await channel.send(response);
} catch (err) {
  logger.error({ err, inboundId: inbound.id }, 'Pipeline failed');
  // decide what to do — fallback message, retry, alert, etc.
}
```

Reference stages catch their own LLM/IO errors and log warnings (so a transient API failure on, say, `classifyIntent` doesn't kill the pipeline; the responder just runs without classification). Custom stages should follow the same pattern if they make external calls.

## Multi-language

If `systemLanguage` differs from the user's detected language:

1. `detectLanguage` sets `ctx.inboundLanguage`.
2. `translateInbound` translates the inbound to `systemLanguage`; classifier/responder/RAG operate on the translation.
3. `translateOutbound` translates the AI response back to the user's language.
4. The persisted outbound contains the user-language text.

For a single-language deployment, the translation stages no-op (when detected language === systemLanguage).

## Public surface

```typescript
import {
  // Pipeline core
  createPipeline,
  type Pipeline, type PipelineConfig, type Env, type Services,
  type Stage, type MessageContext,

  // Wire types
  type InboundMessage, type OutboundMessage, type Conversation, type Message,

  // Domain types
  type Entity, type Intent, type ResponderInput,

  // AI types
  type AIModelTier, type AICompletionMessage, type AICompletionRequest,
  type AICompletionResult, type AIEmbeddingRequest, type AIEmbeddingResult,

  // Service contracts
  type EntityProvider, type IntentProvider, type PromptProvider,
  type AIProvider, type ConversationProvider, type Logger,
  type KnowledgeProvider, type MemoryProvider,

  // Service-related data shapes
  type LogFields,
  type KnowledgeHit, type KnowledgeSearchOptions,
  type MemoryHit, type NewMemory, type MemoryRecallOptions,

  // Inference results
  type ClassificationResult, type AIResponse,

  // Reference stages
  resolveConversation, detectLanguage, translateInbound, loadHistory,
  saveInboundMessage, classifyIntent, computeEmbedding, searchKnowledge,
  recallMemories, generateResponse, translateOutbound, saveOutboundMessage,
  defaultStages,
} from '@jackthebutler/pipeline';
```

## Architecture in one diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR APP                                     │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │ Your channel handler │    │  Your service implementations │   │
│  │ (webhook, websocket) │    │  EntityProvider, AIProvider,  │   │
│  └──────────┬───────────┘    │  ConversationProvider, …      │   │
│             │                └──────────────┬───────────────┘   │
│             ▼                               │                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  @jackthebutler/pipeline                                   │ │
│  │  createPipeline({ intents, prompts, services }).process()  │ │
│  │                                                             │ │
│  │     ┌──────────────────────────────────────────────┐       │ │
│  │     │ Stage 1 → Stage 2 → … → Stage 12             │       │ │
│  │     │  (calls your services via the contracts)     │       │ │
│  │     └──────────────────────────────────────────────┘       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Roadmap (not in V1)

- Streaming responses (`AIProvider.completeStream`)
- Tool use / function calling
- Stage middleware hooks (`before`, `after`, `onError`)
- Activity-log telemetry provider
- Memory-extraction reference stage

## License

MIT (same as the parent project).
