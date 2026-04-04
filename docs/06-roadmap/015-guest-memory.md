# Guest Memory

> Phase: Planned
> Status: Not Started
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

1. **Guest Memory card** — A dedicated card on the guest profile page showing all known facts with category, source, and confidence
2. **Manual corrections** — Staff can add, edit, or delete individual memory entries
3. **Memory audit trail** — Each memory shows which conversation it was learned from and when it was last reinforced

---

## Architecture

### Where it lives

```
src/
  core/
    memory-extractor.ts   # AI-powered extraction after conversation closes
    guest-context.ts      # Extended to load + inject memories (existing file)
  services/
    memory.ts             # CRUD + semantic recall against guest_memories table
  db/
    schema.ts             # New guest_memories table + embedding column
  ai/
    responder.ts          # Injection point in buildPromptMessages() (existing file)
```

### How it connects

```
EXTRACT FLOW (async, after conversation closes)
────────────────────────────────────────────────
conversation-fsm.ts
  → state transition: active/escalated → resolved/closed
  → fires: CONVERSATION_CLOSED event
        ↓
MemoryExtractor.run(conversationId)
  → fetch all messages for this conversation
  → send to AI: extract discrete guest facts
  → returns: MemoryFact[]
        ↓
MemoryService.upsert(guestId, facts[])
  → new fact → insert with embedding
  → existing fact → bump last_reinforced_at, average confidence
  → contradicted fact → update content, reset confidence
        ↓
guest_memories table


RECALL FLOW (before each AI response)
────────────────────────────────────────────────
message-processor.ts
  → guest identified
  → guest context loaded (guest-context.ts buildContext())
        ↓
MemoryService.recall(guestId, currentMessage)
  → embed current message (sqlite-vec)
  → cosine similarity search against guest_memories
  → return top 5 by relevance
        ↓
GuestContext.memories[]  (new field)
        ↓
responder.ts buildPromptMessages()
  → inject as "What Jack knows about this guest"
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

### Semantic Recall

Memories are not loaded as a full dump into the AI prompt. Instead, the current guest message is embedded and compared against all memories for that guest using cosine similarity (sqlite-vec). Only the top 5 most contextually relevant memories are retrieved and injected.

This keeps the prompt lean regardless of how many stays or conversations a guest has had.

### Reinforcement and Contradiction

When a new fact is extracted that closely matches an existing memory (cosine similarity > 0.85):

- **Same meaning** → `last_reinforced_at` is updated, confidence is averaged upward
- **Contradicting meaning** → content is replaced, confidence is reset to the new value, the old conversation reference is preserved in `source_conversation_id`

This prevents memory bloat and keeps facts current — if a guest's room preference changes, Jack updates rather than accumulates.

### Injection into AI Prompt

Recalled memories are injected into the system prompt in `buildPromptMessages()` immediately after the guest profile block:

```
[Hotel context]
[Guest profile: name, loyalty tier, VIP status]
→ [Guest memory: top 5 relevant facts]        ← NEW
[Active reservation: room, dates, status]
[Knowledge base context]
[Conversation history]
```

The block is omitted entirely if no memories exist for the guest, so first-time guests are unaffected.

---

## Security

- Memories are scoped to `guest_id` — no cross-guest data is ever loaded
- The recall query always includes a `WHERE guest_id = ?` filter before semantic ranking
- Staff with `viewer` role can read memories; `manager` or above can edit or delete
- Memory content is stored as plain text — no PII encryption at rest beyond what applies to the guests table generally
- Extraction runs with a restricted AI prompt that explicitly instructs the model not to store payment data, passport numbers, or health information

---

## Admin Experience

- **Configuration** — No per-hotel configuration required; memory is on by default when the feature ships
- **Opt-out** — A future settings toggle (`enableGuestMemory: boolean`) can disable extraction globally; existing memories are retained but not added to
- **Reset** — Staff can clear all memories for a single guest from the guest profile page

---

## What's NOT in Scope (Future)

- **Guest self-service** — Guests managing their own memory profile via a web form is deferred; staff is the only actor who can edit memories in v1
- **Cross-property memory** — Memory is per-property; a guest who stays at two hotels using Jack has separate memory stores per property
- **Memory confidence UI** — Displaying confidence scores to staff is deferred; v1 shows content and category only
- **Preference inference from PMS** — Mining PMS booking history (room type selections, past special requests) as a memory source is deferred to a later phase
- **Temporal preferences** — Time-based rules ("quiet room on weeknights, sea view on weekends") are out of scope for v1

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

## Implementation Phases

Each stage ends with something runnable and verifiable — either a passing test suite, a working API call, or a visible UI change. No stage depends on the next being built.

---

### Stage 0 — Conversation idle timeout (prerequisite)

**Goal:** Conversations that go quiet are automatically closed after a configurable inactivity period, without requiring staff action.

This is a prerequisite because memory extraction (Stage 4) subscribes to end-of-conversation events. Today there are two conversation end states and one event:

| Path | FSM state | Event today |
|---|---|---|
| Staff clicks resolve | `resolved` | `CONVERSATION_RESOLVED` ✅ exists |
| Idle timeout | `closed` | `CONVERSATION_CLOSED` ❌ does not exist |

In practice, most WhatsApp and SMS conversations end silently — the guest gets their answer and stops replying. Staff rarely click resolve for every thread. Without an automatic timeout, `CONVERSATION_RESOLVED` fires infrequently and memory extraction barely runs.

**What to build:**

1. **Add `CONVERSATION_CLOSED` to `src/types/events.ts`**

```typescript
// In EventTypes const:
CONVERSATION_CLOSED: 'conversation.closed',

// New event interface:
export interface ConversationClosedEvent extends BaseEvent {
  type: typeof EventTypes.CONVERSATION_CLOSED;
  conversationId: string;
  guestId: string;
  reason: 'timeout' | 'staff_resolved' | 'guest_satisfied';
}

// Add to AppEvent union:
| ConversationClosedEvent
```

2. **Add idle timeout job to `src/services/scheduler.ts`**
   - Runs every 30 minutes
   - Queries conversations where `state IN ('active', 'waiting')` and `last_message_at < now - idleTimeoutHours`
   - Fires the `timeout` FSM transition on each matched conversation → state becomes `closed`
   - Emits `CONVERSATION_CLOSED` with `reason: 'timeout'`
   - `idleTimeoutHours` is configurable per channel type (default: 4h for WhatsApp/SMS, 24h for email)

3. **Emit `CONVERSATION_CLOSED` on staff resolve too**
   - Where `CONVERSATION_RESOLVED` is currently emitted, also emit `CONVERSATION_CLOSED` with `reason: 'staff_resolved'`
   - This means Stage 4 (memory extractor) subscribes to only `CONVERSATION_CLOSED` for both paths — one listener, consistent behaviour

The event flow after this stage:

```
Staff resolves  → CONVERSATION_RESOLVED (existing, unchanged)
                → CONVERSATION_CLOSED { reason: 'staff_resolved' }  ← new

Idle timeout    → scheduler fires FSM timeout transition
                → CONVERSATION_CLOSED { reason: 'timeout' }          ← new
```

Memory extraction in Stage 4 subscribes only to `CONVERSATION_CLOSED` — it handles both paths without caring about the reason.

**Testable:** Set `idleTimeoutHours` to 1 minute in a test environment. Send a message and wait. Trigger the scheduler job manually via the existing `triggerJob()` API. Assert the conversation state is `closed` and `CONVERSATION_CLOSED` was emitted with `reason: 'timeout'`. Assert a conversation with a message sent 30 seconds ago is untouched.

---

### Stage 1 — Database schema

**Goal:** The `guest_memories` table exists and migrations run cleanly.
Add the table and indexes to `schema.ts`, generate and run the migration.
**Testable:** Migration runs without error on a fresh and existing database. Table is visible in Drizzle Studio.

---

### Stage 2 — MemoryService CRUD (no AI, no embeddings)

**Goal:** Memories can be created, read, and deleted via a service layer.
Build `src/services/memory.ts` with `insert()`, `listForGuest()`, and `delete()`. No embeddings yet — `embedding` column stays null.
**Testable:** Unit tests cover insert, list, and delete. A memory row appears in the database after `insert()` is called.

---

### Stage 3 — Memory extraction (AI, no wiring)

**Goal:** Given a conversation transcript, the AI returns a structured list of guest facts.
Build `src/core/memory-extractor.ts` with a single `extract(messages[])` method. Calls the AI provider with a structured extraction prompt. Returns `MemoryFact[]`. No event wiring, no database writes yet.
**Testable:** Unit test feeds in a sample transcript and asserts that the returned facts are typed, non-empty, and plausible. Can be run manually against a seeded conversation.

---

### Stage 4 — Wire extraction to conversation close event

**Goal:** Memories are automatically extracted and stored when a conversation resolves or closes.
Subscribe to the `CONVERSATION_CLOSED` / `CONVERSATION_RESOLVED` event in the conversation FSM. Call `MemoryExtractor.extract()` then `MemoryService.insert()` for each returned fact. Runs async — does not block message processing.
**Testable:** Close a real conversation in the dashboard or via API. Query `guest_memories` — rows for that guest appear with correct `conversation_id`, `category`, and `content`.

---

### Stage 5 — Embeddings on write

**Goal:** Every memory row has a vector embedding stored alongside its content.
Extend `MemoryService.insert()` to call the active embeddings provider and store the result in the `embedding` column (sqlite-vec blob). Embeddings are generated at write time, not retroactively.
**Testable:** After Stage 4 closes a conversation, query `guest_memories` — `embedding` column is non-null. Assert blob length matches the model's expected dimensions.

---

### Stage 6 — Deduplication and reinforcement

**Goal:** Duplicate and contradicting facts are merged at write time, so the memory store stays clean from the first conversation.

This moves earlier than recall or injection because duplicates accumulate from Stage 4 onwards. Waiting until after injection (old Stage 8) means dirty data builds up across real conversations before deduplication ever runs.

**Why cosine similarity alone is not enough**

Similarity tells you two facts are about the same topic — not whether they agree or disagree. For example:
- `"Prefers a quiet room"` vs `"Prefers a room near the elevator"` — high similarity, but contradicting
- `"Prefers a quiet room"` vs `"Always requests a quiet room away from the lift"` — high similarity, same meaning

A similarity score alone cannot distinguish these. A second lightweight AI classification call is required after a near-match is detected.

**The three-step process inside `MemoryService.insert()`:**

1. **Embed the incoming fact** and run cosine similarity against all existing memories for the same guest
2. **If similarity > 0.85** (near-match found), send both facts to the AI with a single classification prompt:
   > *"Do these two statements confirm the same thing, contradict each other, or are they about different things? Reply with one word: CONFIRMS, CONTRADICTS, or DIFFERENT."*
3. **Act on the classification:**

| Similarity | AI classification | Action |
|---|---|---|
| > 0.85 | `CONFIRMS` | Bump `last_reinforced_at`. Increase confidence: `new = min(1.0, old + 0.1)`. No new row. |
| > 0.85 | `CONTRADICTS` | Replace `content` with the newer fact. Reset `confidence` to the incoming value. Bump `last_reinforced_at`. No new row. |
| > 0.85 | `DIFFERENT` | Treat as unrelated — insert as a new row despite high similarity. |
| ≤ 0.85 | — (not called) | Insert as a new row. |

Requires embeddings from Stage 5. Falls back to plain insert (no dedup check) if the embedding provider is unavailable, so extraction still works degraded.

**Testable:**
- Insert `"Prefers quiet rooms"` twice → assert one row, `last_reinforced_at` updated, confidence increased
- Insert `"Prefers quiet rooms"` then `"Prefers rooms near the elevator"` → assert one row, content updated to the newer fact
- Insert `"Prefers quiet rooms"` then `"Allergic to feather pillows"` → assert two rows (genuinely different topics)
- Disable embedding provider, insert two facts → assert both insert without error (graceful degradation)

---

### Stage 7 — Semantic recall

**Goal:** Given a guest, return the most relevant memories for the current message.

Build `MemoryService.recall(guestId, queryEmbedding: number[], topK = 5)`. Receives `ctx.queryEmbedding` directly — the embedding already computed by the `computeEmbedding` pipeline stage upstream. Runs cosine similarity against that guest's memories using sqlite-vec, returns top K results. Falls back to recency order if no embedding is provided.

Because this phase depends on the [Message Pipeline Refactor](./014-message-pipeline.md), `ctx.queryEmbedding` is already in the context by the time the `recallMemories` stage runs. No second embed call, no cache, no coordination — the pipeline makes it free.

```typescript
// src/core/pipeline/stages/recall-memories.ts
export async function recallMemories(ctx: MessageContext): Promise<void> {
  if (!ctx.guestContext?.guest?.id || !ctx.queryEmbedding) return;

  ctx.memories = await memoryService.recall(
    ctx.guestContext.guest.id,
    ctx.queryEmbedding,   // already computed upstream — no API call
  );
}
```

**Testable:** Unit test inserts three memories with varying relevance, calls `recall()` with a pre-computed embedding, asserts the most relevant memory ranks first. Integration test sends a message end-to-end and asserts `embeddingProvider.embed` was called exactly once despite both knowledge search and memory recall running.

---

### Stage 8 — Inject memories into AI prompt

**Goal:** Returning guests receive responses that reference their past preferences.

Add `memories?: MemoryFact[]` to `MessageContext`. The `recallMemories` stage (Stage 7) populates it. In the `generateResponse` pipeline stage, pass `ctx.memories` into `buildPromptMessages()` and inject the memories block after the guest profile section. Block is omitted entirely if `ctx.memories` is empty or undefined — first-time guests are unaffected.

**Testable:** Send a message from a guest who has memories stored. Inspect the AI response — it should reference the known preference naturally. Assert `ctx.memories` is populated after the `recallMemories` stage. Verify the system prompt in debug logs contains the memory block.

---

### Stage 9 — Staff read-only memory view (dashboard)

**Goal:** Staff can see all memories for a guest on the guest profile page.
Add a "What Jack Knows" card to the guest detail page in the dashboard. Fetches from `GET /api/v1/guests/:id/memories`. Shows category badge, content, source, and last reinforced date. Read-only.
**Testable:** Open any guest with stored memories in the dashboard — the card appears with correct data. Open a guest with no memories — the card is hidden or shows an empty state.

---

### Stage 10 — Staff memory management (dashboard)

**Goal:** Staff can add, edit, and delete individual memory entries.
Extend the memory card with add, edit, and delete actions. Calls `POST`, `PATCH`, and `DELETE` on `/api/v1/guests/:id/memories/:memoryId`. Newly added memories have `source: 'manual'` and no embedding until next recall cycle.
**Testable:** Staff adds a manual memory — it appears in the card and in the database. Staff deletes a memory — it no longer appears in the card or in AI prompts.

---

## Related Documents

- [Message Pipeline Refactor](./014-message-pipeline.md) — Required dependency; `ctx.queryEmbedding` from the pipeline eliminates the need for any embedding cache or coordination in this feature
- [Multilingual Translation](./007-multilingual-translation.md) — Extraction must handle translated conversation content; the extractor should operate on original-language content where available
- [PMS Sync Freshness](./008-pms-sync-freshness.md) — A future phase will mine PMS booking history as a memory source
