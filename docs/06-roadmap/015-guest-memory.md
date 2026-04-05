# Guest Memory

> Phase: Complete
> Status: Shipped
> Priority: High
> Depends On: [Multilingual Translation](./007-multilingual-translation.md), [Message Pipeline Refactor](./014-message-pipeline.md)

## Overview

Guest Memory gives Jack the ability to remember facts learned from past conversations and apply them to future interactions. Instead of treating every conversation as a blank slate, Jack recalls guest preferences, habits, and history — delivering personalised service that feels like a boutique hotel knowing its regulars.

## Goals

1. **Persistent guest knowledge** — Facts learned in one conversation survive across all future conversations with the same guest
2. **Relevant recall** — Only memories pertinent to the current request are surfaced, keeping the AI prompt focused
3. **Automatic extraction** — Memories are extracted by AI after each conversation closes, requiring no manual data entry
4. **Reinforcement** — Repeated facts grow in confidence; contradicted facts are updated rather than duplicated
5. **Staff visibility** — Hotel staff can view, edit, and delete what Jack knows about any guest
6. **Privacy by design** — Guest memories are never shared across guests or exposed outside their own conversation context

## Key Features

### Guest-Facing

1. **Personalised greetings** — Returning guests are recognised and addressed by name with context from past stays
2. **Preference recall** — Room temperature, pillow type, dietary needs, quiet floor preference — Jack remembers without being asked again
3. **Continuity across channels** — Memory follows the guest regardless of whether they contact via WhatsApp, SMS, or email

### Staff-Facing (Dashboard)

1. **Jack's Memory card** — A dedicated card on the guest profile page showing all known facts with category, source, and last reinforced date. Cards are colour-coded by category (preference, complaint, habit, personal, request) using distinct icons and tinted backgrounds.
2. **Manual corrections** — Staff can add, edit, or delete individual memory entries inline
3. **Memory audit trail** — Each memory shows its source and last reinforced date. AI-extracted memories link directly to the originating conversation

---

## Architecture

### Where it lives

```
src/
  core/
    memory-extractor.ts        # AI-powered extraction after conversation closes
    memory-event-subscriber.ts # Subscribes to CONVERSATION_CLOSED, wires extraction
    guest-context.ts           # Extended to load + inject memories (existing file)
    pipeline/stages/
      recall-memories.ts       # Pipeline stage: recalls top-K memories into ctx
  services/
    memory.ts                  # CRUD + semantic recall against guest_memories table
    scheduler.ts               # Idle timeout job (closes quiet conversations)
  db/
    schema.ts                  # guest_memories table + embedding column
  ai/
    responder.ts               # Injection point in buildPromptMessages() (existing file)
```

### How it connects

```
EXTRACT FLOW (async, after conversation closes)
────────────────────────────────────────────────
conversation FSM / scheduler
  → state transition: active/waiting → closed/resolved
  → fires: CONVERSATION_CLOSED event
        ↓
memory-event-subscriber.ts
  → MemoryExtractor.extract(messages[])
  → returns: MemoryFact[]
        ↓
MemoryService.insert(guestId, facts[])
  → new fact     → insert with embedding
  → near-match   → AI classifies: CONFIRMS / CONTRADICTS / DIFFERENT
  → CONFIRMS     → bump last_reinforced_at, increase confidence by 0.1
  → CONTRADICTS  → replace content, reset confidence
  → DIFFERENT    → insert as new row
        ↓
guest_memories table


RECALL FLOW (before each AI response)
────────────────────────────────────────────────
message-processor.ts pipeline
  → computeEmbedding stage runs first (one embed call for the whole pipeline)
        ↓
recallMemories stage
  → MemoryService.recall(guestId, ctx.queryEmbedding)
  → cosine similarity search via sqlite-vec (falls back to recency if no embedding)
  → return top 5 by relevance → stored in ctx.memories
        ↓
generateResponse stage
  → passes ctx.memories into defaultResponder.generate()
        ↓
responder.ts buildPromptMessages()
  → inject as "## What Jack Knows About This Guest:"
  → injected after guest profile, before reservation context
```

---

## Core Concepts

### Memory Extraction

After a conversation reaches `resolved` or `closed` state, the `MemoryExtractor` runs asynchronously — it does not block message processing or add latency to responses.

The extractor sends the full conversation transcript to the AI with a structured prompt instructing it to extract discrete, durable facts about the guest. The AI returns a list of typed facts:

```typescript
interface MemoryFact {
  category: 'preference' | 'complaint' | 'habit' | 'personal' | 'request';
  content: string;        // "Prefers a quiet room away from the elevator"
  confidence: number;     // 0.0 – 1.0
}
```

Transient facts (e.g. "guest asked for a taxi at 9am today") are intentionally excluded — the extraction prompt instructs the AI to only extract facts likely to be relevant on future stays.

The extractor always operates on `translatedContent` when available so extraction runs on English regardless of the guest's language.

### Semantic Recall

Memories are not loaded as a full dump into the AI prompt. Instead, the current guest message's embedding (already computed by the `computeEmbedding` pipeline stage) is compared against all memories for that guest using cosine similarity (sqlite-vec). Only the top 5 most contextually relevant memories are retrieved and injected.

When no embedding is available (embedding provider unavailable), recall falls back to the 5 most recently reinforced memories. This keeps the feature working in degraded mode.

This keeps the prompt lean regardless of how many stays or conversations a guest has had. Because `ctx.queryEmbedding` is reused, the embedding API is called exactly once per message regardless of how many pipeline stages use it.

### Reinforcement and Contradiction

When a new fact is extracted that closely matches an existing memory (cosine similarity > 0.85):

- **Same meaning** → `last_reinforced_at` is updated, confidence is incremented: `min(1.0, old + 0.1)`
- **Contradicting meaning** → content is replaced, confidence is reset to the new value
- **Different topic** → inserted as a new row despite high similarity

This prevents memory bloat and keeps facts current — if a guest's room preference changes, Jack updates rather than accumulates.

### Injection into AI Prompt

Recalled memories are injected into the system prompt in `buildPromptMessages()` immediately after the guest profile block:

```
[Hotel context]
[Guest profile: name, loyalty tier, VIP status]
→ [Guest memory: top 5 relevant facts]        ← injected here
[Active reservation: room, dates, status]
[Knowledge base context]
[Conversation history]
```

The block is omitted entirely if no memories exist for the guest, so first-time guests are unaffected.

---

## Security

- Memories are scoped to `guest_id` — no cross-guest data is ever loaded
- The recall query always includes a `WHERE guest_id = ?` filter before semantic ranking
- All PATCH and DELETE memory API routes verify `memory.guestId === guestId` before acting — prevents cross-guest memory access via URL manipulation
- Staff with `viewer` role can read memories; `manager` or above can edit or delete
- Memory content is stored as plain text — no PII encryption at rest beyond what applies to the guests table generally
- Extraction runs with a restricted AI prompt that explicitly instructs the model not to store payment data, passport numbers, or health information

---

## Admin Experience

- **Configuration** — No per-hotel configuration required; memory is on by default
- **Opt-out** — A future settings toggle (`enableGuestMemory: boolean`) can disable extraction globally; existing memories are retained but not added to
- **Reset** — A future action to clear all memories for a single guest from the guest profile page (not yet in v1)

---

## What's NOT in Scope (Future)

- **Guest self-service** — Guests managing their own memory profile via a web form is deferred; staff is the only actor who can edit memories in v1
- **Cross-property memory** — Memory is per-property; a guest who stays at two hotels using Jack has separate memory stores per property
- **Memory confidence UI** — Displaying confidence scores to staff is deferred; v1 shows content and category only
- **Preference inference from PMS** — Mining PMS booking history (room type selections, past special requests) as a memory source is deferred to a later phase
- **Temporal preferences** — Time-based rules ("quiet room on weeknights, sea view on weekends") are out of scope for v1
- **Conversation link in card** — AI-extracted memories link directly to the originating conversation (`/inbox/:conversationId`) when a conversation ID is present
- **Per-channel idle timeout** — The scheduler uses a single fixed 4-hour idle timeout for all channels. The planned per-channel configuration (4h WhatsApp/SMS, 24h email) is deferred

---

## Data Model

### New table: `guest_memories`

```typescript
export const guestMemories = sqliteTable('guest_memories', {
  id:                  text('id').primaryKey(),
  guestId:             text('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  conversationId:      text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  category:            text('category', {
                         enum: ['preference', 'complaint', 'habit', 'personal', 'request']
                       }).notNull(),
  content:             text('content').notNull(),
  source:              text('source', {
                         enum: ['ai_extracted', 'manual', 'pms']
                       }).notNull().default('ai_extracted'),
  confidence:          real('confidence').notNull().default(1.0),
  embedding:           blob('embedding'),           // sqlite-vec float32[]
  createdAt:           integer('created_at', { mode: 'timestamp' }).notNull(),
  lastReinforcedAt:    integer('last_reinforced_at', { mode: 'timestamp' }).notNull(),
});
```

### Indexes

```sql
CREATE INDEX idx_guest_memories_guest    ON guest_memories (guest_id);
CREATE INDEX idx_guest_memories_category ON guest_memories (guest_id, category);
```

### Changes to existing tables

None. The `guests.preferences` field (current plain-text JSON array) is not removed — it continues to serve as a manual preference store for staff — but memory extraction writes to `guest_memories`, not to `guests.preferences`.

---

## API Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/v1/guests/:id/memories` | `GUESTS_VIEW` | List all memories for a guest (embedding stripped from response) |
| `POST` | `/api/v1/guests/:id/memories` | `GUESTS_MANAGE` | Add a manual memory (`source: 'manual'`, `confidence: 1.0`) |
| `PATCH` | `/api/v1/guests/:id/memories/:memoryId` | `GUESTS_MANAGE` | Update category and/or content; clears embedding when content changes |
| `DELETE` | `/api/v1/guests/:id/memories/:memoryId` | `GUESTS_MANAGE` | Delete a memory; verifies ownership before deleting |

---

## Implementation Phases

Each stage ends with something runnable and verifiable — either a passing test suite, a working API call, or a visible UI change. No stage depends on the next being built.

---

### Stage 0 — Conversation idle timeout (prerequisite) ✅

**Goal:** Conversations that go quiet are automatically closed after a configurable inactivity period.

Implemented in `src/services/scheduler.ts`. The scheduler runs every 30 minutes and closes conversations where `state IN ('active', 'waiting')` and `last_message_at < now - 4h`. On close, it emits `CONVERSATION_CLOSED` with `reason: 'timeout'`.

`CONVERSATION_CLOSED` is also emitted by `src/services/conversation.ts` on staff resolve (with `reason: 'staff_resolved'`), so the memory extractor subscribes to a single event for both paths.

Note: The current implementation uses a single 4-hour threshold for all channels. Per-channel timeouts (planned: 4h WhatsApp/SMS, 24h email) are deferred.

---

### Stage 1 — Database schema ✅

`guest_memories` table and indexes added to `src/db/schema.ts`. Migration runs cleanly on fresh and existing databases.

---

### Stage 2 — MemoryService CRUD ✅

`src/services/memory.ts` implements:
- `insert(guestId, conversationId, facts[], source)` — handles upsert logic internally (dedup/reinforce/insert)
- `listForGuest(guestId)` — all memories, recency-ordered
- `recall(guestId, queryEmbedding?, topK)` — semantic or recency fallback
- `getById(id)` — throws `NotFoundError` if missing
- `update(id, patch)` — updates category and/or content; clears embedding when content changes
- `delete(id)` — throws `NotFoundError` if missing

The singleton `memoryService` (no provider) handles read-only and delete operations. For writes with deduplication, instantiate with `new MemoryService(provider)`.

---

### Stage 3 — Memory extraction ✅

`src/core/memory-extractor.ts` — `MemoryExtractor.extract(messages[], conversationId?)` sends the transcript to the AI (`modelTier: 'utility'`, `temperature: 0.1`) and returns validated `MemoryFact[]`. Never throws — returns `[]` on any failure.

Uses `translatedContent` when available so extraction always runs on English source.

---

### Stage 4 — Wire extraction to conversation close event ✅

`src/core/memory-event-subscriber.ts` subscribes to `CONVERSATION_CLOSED`. On event, it fetches all messages for the conversation, runs `MemoryExtractor.extract()`, then calls `MemoryService.insert()`. Runs async — does not block message processing.

---

### Stage 5 — Embeddings on write ✅

`MemoryService.insert()` calls the active embedding provider and stores the float32 vector as a sqlite-vec blob in the `embedding` column. Falls back to plain insert (no dedup check) if the provider is unavailable.

---

### Stage 6 — Deduplication and reinforcement ✅

Inside `MemoryService.insert()`, for each incoming fact:

1. Embed the fact and run cosine similarity against all existing memories for that guest
2. If similarity > 0.85, classify with a lightweight AI call: `CONFIRMS`, `CONTRADICTS`, or `DIFFERENT`
3. Act on classification:

| Similarity | Classification | Action |
|---|---|---|
| > 0.85 | `CONFIRMS` | Bump `last_reinforced_at`. Confidence: `min(1.0, old + 0.1)`. No new row. |
| > 0.85 | `CONTRADICTS` | Replace `content`. Reset `confidence` to incoming value. Bump `last_reinforced_at`. No new row. |
| > 0.85 | `DIFFERENT` | Insert as new row. |
| ≤ 0.85 | — | Insert as new row. |

Defaults to `DIFFERENT` on any classification error — insertion is always safe.

---

### Stage 7 — Semantic recall ✅

```typescript
// src/core/pipeline/stages/recall-memories.ts
export async function recallMemories(ctx: MessageContext): Promise<void> {
  const guestId = ctx.guestContext?.guest?.id;
  if (!guestId) return;

  ctx.memories = await memoryService.recall(guestId, ctx.queryEmbedding);
}
```

`ctx.queryEmbedding` is reused from the `computeEmbedding` stage — no second embed call. Falls back to recency order when embedding is absent. The embedding provider is called exactly once per message across the entire pipeline.

---

### Stage 8 — Inject memories into AI prompt ✅

`ctx.memories` is typed as `GuestMemory[]` on `MessageContext`. The `generateResponse` stage passes it as a 5th parameter to `defaultResponder.generate()`. In `buildPromptMessages()`, memories are injected after the guest profile block:

```
## What Jack Knows About This Guest:
- preference: Prefers a quiet room away from the elevator
- habit: Always orders green tea on arrival
```

Block is omitted entirely when `ctx.memories` is empty or undefined.

---

### Stage 9 — Staff read-only memory view ✅

`GET /api/v1/guests/:id/memories` returns all memories for a guest (binary `embedding` field stripped). The guest profile page shows a "Jack's Memory" card with colour-coded category cards in a responsive 3-column grid. Each card shows icon, category label, content, source (AI/Staff/PMS), and last reinforced date. AI-extracted memories link directly to the originating conversation. Hidden for guests with no memories and no manage permission.

---

### Stage 10 — Staff memory management ✅

Staff can add, edit, and delete memory entries from the guest profile. The add form appears as the first card in the grid, dynamically colour-coded by selected category. Edit mode is inline within the card. All destructive deletes require a confirmation dialog. Keyboard shortcuts: `Ctrl+Enter` / `Cmd+Enter` to save, `Escape` to cancel.

API calls: `POST /api/v1/guests/:id/memories`, `PATCH /api/v1/guests/:id/memories/:memoryId`, `DELETE /api/v1/guests/:id/memories/:memoryId`.

---

## Related Documents

- [Message Pipeline Refactor](./014-message-pipeline.md) — Required dependency; `ctx.queryEmbedding` from the pipeline eliminates the need for any embedding cache or coordination in this feature
- [Multilingual Translation](./007-multilingual-translation.md) — Extraction operates on `translatedContent` where available so the AI always reads English source
- [PMS Sync Freshness](./008-pms-sync-freshness.md) — A future phase will mine PMS booking history as a memory source
