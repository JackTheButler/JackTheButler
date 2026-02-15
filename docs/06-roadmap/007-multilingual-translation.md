# Multilingual Translation

> Phase: Complete
> Status: All 4 phases implemented
> Priority: High

## Overview

Automatic translation of guest messages, AI responses, and staff messages so that guests, staff, and the AI knowledge base can each operate in different languages. Solves the problem where a Farsi-speaking guest messages a hotel whose staff speaks Spanish and whose knowledge base is in English — today, the RAG retrieval fails and staff can't read the guest's messages.

## Goals

1. **Seamless guest communication** — Guests write in any language and receive responses in their language, without manual intervention
2. **Staff comprehension** — Staff always see messages in the property's operating language, regardless of what language the guest writes in
3. **Accurate RAG retrieval** — Knowledge base queries are translated to the KB language before embedding search, so cross-lingual retrieval works correctly
4. **Bidirectional staff replies** — When staff sends a message, it's automatically translated to the guest's detected language
5. **Language memory** — The system remembers each guest's language per conversation and updates it if the guest switches languages

## Key Features

### User-Facing

1. **Write in any language** — Guests send messages in their native language across all channels (WhatsApp, SMS, email, web chat) with no configuration needed
2. **Receive responses in their language** — AI-generated responses are translated to the guest's detected language before delivery
3. **Translated staff replies** — When staff responds, the guest receives the message in their own language

### Staff-Facing (Dashboard)

1. **Messages in property language** — All guest messages appear translated to the property's operating language in the conversation view
2. **Original text available** — Staff can view the original untranslated message if needed
3. **Auto-translated replies** — Staff types in their language; the system translates to the guest's language before sending
4. **Language indicator** — Conversations show the detected guest language as a badge/tag

---

## Architecture

### Where It Lives

| Piece | Location | Purpose |
|-------|----------|---------|
| Translation service | `src/services/translation.ts` | Language detection and translation via the configured LLM provider |
| Message processor integration | `src/core/message-processor.ts` | Hooks translation into the inbound/outbound message flow |
| Property language setting | `settings` table, key `property_language` | Read directly via drizzle query (same pattern as `hotel_profile`, `auth_settings`) |

### How It Connects

```
Guest sends message (any language)
    ↓
Message Processor (inbound)
    ↓ detect language → store in conversation.guestLanguage
    ↓ translate content → property language → store as message.translatedContent
    ↓
AI Responder
    ↓ translate query → English (transient, for embedding search only)
    ↓ RAG retrieval against English KB
    ↓ generate response in property language
    ↓
Message Processor (outbound)
    ↓ translate response → guest language
    ↓
Guest receives response (in their language)
```

```
Staff sends reply (in property language)
    ↓
Message Processor (outbound)
    ↓ look up conversation.guestLanguage
    ↓ translate → guest language → store as message.translatedContent
    ↓
Guest receives translated reply
```

### Three-Language Flow

The system handles up to three different languages simultaneously:

- **Guest language** — detected from messages, stored per conversation
- **Property language** — configured in settings, used by staff and for dashboard display
- **KB language** — always English (constrained by the embedding model `all-MiniLM-L6-v2` which is English-only)

When all three differ (e.g., guest=Farsi, staff=Spanish, KB=English):

1. Guest message arrives in Farsi
2. Translated to Spanish for staff (stored as `translatedContent`)
3. Translated to English for RAG query (transient, discarded after retrieval)
4. AI generates response using English KB context
5. Response stored in Spanish (property language) as `content`
6. Response translated to Farsi for guest delivery (stored as `translatedContent`)

---

## Core Concepts

### Language Detection

The system detects the guest's language from their first message and stores it on the conversation record (`conversations.guestLanguage`). Detection is performed by the LLM as part of message processing — no separate API call needed.

- **First message**: Detect and set `conversations.guestLanguage`
- **Subsequent messages**: Re-detect; if changed, update the conversation record
- **Fallback**: If detection fails, assume property language (no translation needed)

### Message Translation Pipeline

Translation happens at two points in the message lifecycle:

**Inbound (guest → system):**
1. Detect language
2. If guest language differs from property language, translate to property language
3. Store translation in `messages.translatedContent`
4. Store detected language in `messages.detectedLanguage`

**Outbound (system/staff → guest):**
1. Look up `conversations.guestLanguage`
2. If guest language differs from the message language, translate to guest language
3. Store translation in `messages.translatedContent`
4. Send the translated version to the guest

### RAG Query Translation

The knowledge base is stored in English — this is a hard constraint of the current embedding model (`all-MiniLM-L6-v2`, English-only). When the guest's query is not in English:

1. Translate the guest's query to English
2. Generate embeddings from the translated query
3. Perform vector search against the English KB
4. Retrieved context is already in English — passed directly to the AI
5. **This translation is transient** — not stored in the database, only used for the retrieval step

Without this, Farsi queries produce poor cosine similarity against English document embeddings, and relevant KB results are missed.

### Property Language

A system-level setting (`property_language` in the settings table) that defines the hotel's operating language. This is the language staff reads and writes in.

- Set during initial setup or in dashboard settings
- Defaults to `en` (English)
- Used as the target language for all inbound message translations
- AI responses are generated in this language
- All dashboard content displays in this language

---

## Security

- **Translation data stays local** — All translations use the hotel's own configured AI provider; no external translation APIs
- **Original content preserved** — The original `content` field is never overwritten; translations go in `translatedContent`
- **No data leakage** — Transient RAG translations are discarded after retrieval, not logged or stored

---

## Admin Experience

- **Property language** — Set in dashboard settings (Settings → General or during setup wizard)
- **No per-conversation configuration** — Translation is automatic based on detected guest language
- **Knowledge base language** — Always English, constrained by the embedding model (`all-MiniLM-L6-v2`). Staff must write KB content in English. If the embedding model is upgraded to a multilingual one in the future, this constraint can be revisited

---

## What's NOT in Scope (Future)

- **Non-English knowledge base** — KB is English-only due to `all-MiniLM-L6-v2` embedding model. Supporting other KB languages requires a multilingual embedding model first
- **Staff language preferences** — Per-staff-member language settings; for now all staff use the single property language
- **Translation quality feedback** — UI for staff to correct or rate translations
- **Dedicated translation API** — Using Google Translate, DeepL, etc. instead of the LLM; the current approach uses the same AI provider for simplicity
- **Language-specific AI personas** — Different system prompts or tones per language

---

## Data Model

### Modified Tables

**`messages` table** — two new columns:

```sql
ALTER TABLE messages ADD COLUMN translated_content TEXT;
ALTER TABLE messages ADD COLUMN detected_language TEXT;
```

- `translatedContent` (`text`, nullable) — For inbound messages: translation in property language. For outbound messages: translation in guest language. NULL when no translation needed (same language).
- `detectedLanguage` (`text`, nullable) — ISO 639-1 language code detected from the message content (e.g., `fa`, `es`, `en`). NULL for outbound system/staff messages.

**`conversations` table** — one new column:

```sql
ALTER TABLE conversations ADD COLUMN guest_language TEXT DEFAULT 'en';
```

- `guestLanguage` (`text`, default `'en'`) — The detected language of the guest in this conversation. Updated when language detection runs. More accurate than `guests.language` because it's per-conversation.

### Settings

**`settings` table** — one new key-value entry:

| Key | Value | Description |
|-----|-------|-------------|
| `property_language` | `en` (default) | ISO 639-1 code for the hotel's operating language |

---

## Implementation Phases

### Phase 1: Detection + Inbound Translation

**Goal:** The system detects guest language, translates inbound messages to property language, and stores both. Staff sees translated messages in dashboard.

Single phase because detection without translation has no user-visible value. Both are needed for the first useful outcome: staff can read foreign-language messages.

#### What's Built

1. `detectedLanguage`, `translatedContent` columns on `messages` table
2. `guestLanguage` column on `conversations` table
3. `property_language` key in `settings` table
4. Translation service with `detectAndTranslate()` method
5. Detection + translation hook in message processor *before* saving inbound message
6. Conversation and guest language updated on each inbound message
7. Dashboard shows `translatedContent` with "Show original" toggle

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/db/schema.ts` | Modify | Add `detectedLanguage` and `translatedContent` to `messages`, `guestLanguage` to `conversations` |
| `src/types/message.ts` | Modify | Add `detectedLanguage` and `translatedContent` to `CreateMessageInput` |
| `src/services/translation.ts` | Create | Translation service |
| `src/core/message-processor.ts` | Modify | Detect + translate *before* step 4 (save inbound), pass fields into the single insert |
| `src/services/conversation.ts` | Modify | Accept new fields in `addMessage()` insert |
| `apps/dashboard/src/components/conversations/` | Modify | Show `translatedContent` with toggle |
| Migration file | Generate | `pnpm db:generate` |

#### Technical Details

**Schema changes:**

```typescript
// src/db/schema.ts — messages table (after deliveryError, line 319)
detectedLanguage: text('detected_language'),
translatedContent: text('translated_content'),

// src/db/schema.ts — conversations table (after idleWarnedAt, line 262)
guestLanguage: text('guest_language').default('en'),
```

**Translation service** — `src/services/translation.ts`:

Uses the lazy `getProvider()` pattern from `src/ai/index.ts` — no constructor dependency on provider. Functions, not a class, matching the simpler services.

```typescript
import { getProvider } from '@/ai/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('translation');

interface DetectAndTranslateResult {
  detectedLanguage: string;
  translatedContent: string | null;  // null when same as target language
}

/**
 * Detect language and optionally translate in a single LLM call.
 */
export async function detectAndTranslate(
  text: string,
  targetLanguage: string
): Promise<DetectAndTranslateResult>

/**
 * Translate text to a target language.
 */
export async function translate(
  text: string,
  targetLanguage: string,
  sourceLanguage: string
): Promise<string>
```

`detectAndTranslate()` uses one LLM call with a combined prompt:

```
Detect the language of the following text. If it is not in {targetLanguage}, also translate it.
Respond in JSON only: { "language": "xx", "translation": "..." }
If the text is already in {targetLanguage}, respond: { "language": "{targetLanguage}", "translation": null }

Text: "{content}"
```

One call handles both detection and translation. When the guest speaks the property language, `translation` is null — no wasted work.

**Reading property language** — Follows the same direct-query pattern as `hotel_profile` and `auth_settings`:

```typescript
const row = await db.select().from(settings).where(eq(settings.key, 'property_language')).get();
const propertyLanguage = row?.value ?? 'en';
```

**Message processor integration** — In `src/core/message-processor.ts`, *before* step 4 (save inbound message), detect and translate so all fields are included in a single insert:

```
// NEW: 3a. Detect language + translate (before saving)
let detectedLanguage: string | undefined;
let translatedContent: string | undefined;

const propertyLanguage = await getPropertyLanguage();  // reads settings table

try {
  const result = await detectAndTranslate(inbound.content, propertyLanguage);
  detectedLanguage = result.detectedLanguage;
  translatedContent = result.translatedContent ?? undefined;

  // Update conversation guest language
  await this.conversationSvc.update(conversation.id, { guestLanguage: detectedLanguage });

  // Pass to responder via metadata (used by Phase 2 RAG + Phase 3 outbound)
  inbound.metadata = { ...inbound.metadata, detectedLanguage };
} catch (error) {
  log.warn({ error }, 'Language detection failed, saving without translation');
}

// Step 4: Save inbound message (existing, now with translation fields)
const savedInbound = await this.conversationSvc.addMessage(conversation.id, {
  direction: 'inbound',
  senderType: 'guest',
  content: inbound.content,
  contentType: inbound.contentType,
  detectedLanguage,
  translatedContent,
});
```

This is a single DB insert per message — no save-then-update.

**Dashboard display** — In the conversation message component, for inbound messages with `translatedContent`, show the translation by default with a small "Show original" toggle:

```
┌──────────────────────────────────┐
│ Guest (fa)                       │
│ "I need extra towels please"     │  ← translatedContent (property language)
│ ᐯ Show original                  │  ← toggle link
└──────────────────────────────────┘
```

#### How to Test Phase 1

```
1. Run migration: pnpm db:generate && pnpm db:migrate
2. Set property_language = 'en' in settings table
3. Send a Farsi message via any channel
4. Check messages table: detected_language = 'fa', translated_content = English translation
5. Check conversations table: guest_language = 'fa'
6. Send English message: detected_language = 'en', translated_content = NULL
7. Dashboard shows English translation with "Show original" toggle
```

---

### Phase 2: RAG Query Translation

**Goal:** Knowledge base retrieval works accurately regardless of guest language.

Translate guest queries to English before embedding generation. The KB is English (constrained by `all-MiniLM-L6-v2`). Transient translation — not stored.

#### What's Built

1. Query translation step in the AI responder before knowledge base search

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/ai/responder.ts` | Modify | Translate query before `knowledge.search()` (line 183) |

#### Technical Details

**The problem:** The knowledge search at `src/ai/responder.ts` line 183 passes the guest's raw message to `this.knowledge.search(message.content)`. The `KnowledgeService.search()` generates an embedding from the query. When the query is in Farsi but the KB and embedding model are English, the embeddings don't align and relevant results are missed.

**The fix:** Translate the query to English before embedding. Always English — not property language — because the KB and embedding model are English-only.

In `src/ai/responder.ts`, before the knowledge search (line 183):

```typescript
// Translate query to English for RAG (KB + embeddings are English-only)
const guestLanguage = (message.metadata?.detectedLanguage as string)
  ?? conversation.guestLanguage;
let searchQuery = message.content;

if (guestLanguage && guestLanguage !== 'en') {
  try {
    searchQuery = await translate(message.content, 'en', guestLanguage);
  } catch (error) {
    log.warn({ error }, 'RAG query translation failed, using original');
  }
}

const knowledgeContext = await this.knowledge.search(searchQuery, {
  limit: this.maxKnowledgeResults,
  minSimilarity: this.minKnowledgeSimilarity,
});
```

**Where does `guestLanguage` come from?** The message processor (Phase 1) detects language before calling the responder and passes it via `inbound.metadata.detectedLanguage`. Falls back to `conversation.guestLanguage` for edge cases.

```typescript
// In message processor, after detection (Phase 1):
inbound.metadata = { ...inbound.metadata, detectedLanguage };
```

**No storage:** The translated query is a local variable, used for the single `knowledge.search()` call, then discarded.

**Future:** When the embedding model is upgraded to a multilingual model, this translation step can be removed entirely.

#### How to Test Phase 2

```
1. Add English KB articles about pool hours, restaurant, etc.
2. Set property_language = 'es' (staff speaks Spanish, KB is English)
3. Send Farsi message: "استخر تا چه ساعتی باز است؟" (When does the pool close?)
4. Query is translated to English → embeddings match → KB context retrieved
5. AI response includes pool hours info
6. Without Phase 2: same message returns generic response with no KB context
```

---

### Phase 3: Outbound Translation

**Goal:** AI responses and staff replies are delivered to guests in their language.

#### What's Built

1. AI response translation in message processor before saving outbound message
2. Staff reply translation in conversations route before `sendToChannel()`
3. System prompt instruction for the AI to respond in property language
4. AI sees translated inbound messages in conversation history

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/core/message-processor.ts` | Modify | Translate AI response before saving outbound (step 6, line 397) |
| `src/gateway/routes/conversations.ts` | Modify | Translate staff reply before `sendToChannel()` (line 172) |
| `src/ai/responder.ts` | Modify | System prompt instruction + feed `translatedContent` in history |

#### Technical Details

**AI response translation** — After the AI generates a response (step 5, line 136) and before saving the outbound message (step 6, line 397), translate to guest language:

```
const guestLanguage = (inbound.metadata?.detectedLanguage as string)
  ?? conversation.guestLanguage ?? 'en';
const propertyLanguage = await getPropertyLanguage();
let translatedResponseContent: string | undefined;

if (guestLanguage !== propertyLanguage) {
  try {
    translatedResponseContent = await translate(
      response.content, guestLanguage, propertyLanguage
    );
  } catch (error) {
    log.warn({ error }, 'Outbound translation failed');
  }
}

// Step 6: Save outbound message — single insert with both fields
const savedOutbound = await this.conversationSvc.addMessage(conversation.id, {
  direction: 'outbound',
  senderType: 'ai',
  content: response.content,                      // property language (staff reads this)
  translatedContent: translatedResponseContent,    // guest language (guest receives this)
  contentType: 'text',
  intent: response.intent,
  confidence: response.confidence,
  entities: response.entities,
});

// Step 7: Return translated version for channel delivery
const result: OutboundMessage = {
  conversationId: conversation.id,
  content: translatedResponseContent ?? response.content,
  contentType: 'text',
};
```

**`translatedContent` semantics by direction:**
- **Inbound** (guest → system): `content` = original guest language, `translatedContent` = property language
- **Outbound** (system → guest): `content` = property language, `translatedContent` = guest language

The column always holds "the other language" — the one not in `content`. The direction tells you which is which.

**Staff reply translation** — In `src/gateway/routes/conversations.ts`, the conversation is already fetched for the route handler. Before `sendToChannel()` (line 172):

```typescript
const propertyLanguage = await getPropertyLanguage();
const guestLanguage = conversation.guestLanguage ?? 'en';

let translatedContent: string | undefined;
if (guestLanguage !== propertyLanguage) {
  try {
    translatedContent = await translate(body.content, guestLanguage, propertyLanguage);
  } catch (error) {
    log.warn({ error }, 'Staff reply translation failed');
  }
}

// Save with both versions (existing addMessage call, add translatedContent)
// Send translatedContent ?? body.content to channel
```

**AI conversation history** — The AI must see previous messages in property language so it generates coherent responses. In `buildPromptMessages()`, when loading conversation history (lines ~350-390), use `translatedContent` for inbound messages:

```typescript
// For each history message:
const displayContent = msg.direction === 'inbound' && msg.translatedContent
  ? msg.translatedContent   // show property language version to AI
  : msg.content;            // outbound is already in property language
```

**System prompt instruction** — Add to `buildPromptMessages()` in `src/ai/responder.ts`:

```
Always respond in {propertyLanguage}. The guest's messages have been translated for you.
Your response will be automatically translated to the guest's language.
Do NOT translate your response yourself.
```

**Channel delivery** — `sendToChannel()` receives the already-translated content. No changes to channel adapters.

#### How to Test Phase 3

```
1. Property language = 'es', guest language = 'fa'
2. Guest sends Farsi message → AI responds
3. Messages table outbound: content = Spanish, translated_content = Farsi
4. Guest receives Farsi response
5. Dashboard shows Spanish response
6. Staff sends Spanish reply → guest receives Farsi translation
7. Multi-turn: AI sees previous messages in Spanish, responds coherently in Spanish
```

---

### Phase 4: Dashboard UX

**Goal:** Staff has full visibility into translation activity.

Language badge on conversations. Toggle to view original vs. translated on each message. Property language setting in dashboard.

#### What's Built

1. Language badge on conversation list items
2. "Show original" / "Show guest version" toggle on messages
3. Property language selector in settings
4. Language indicator on conversation detail header

#### Files

| File | Action | Purpose |
|------|--------|---------|
| `apps/dashboard/src/components/conversations/ConversationItem.tsx` | Modify | Language badge |
| `apps/dashboard/src/components/conversations/MessageBubble.tsx` | Modify | Content toggle |
| `apps/dashboard/src/features/setup/` or settings page | Modify | Property language selector |

#### Technical Details

**Language badge** — Show ISO 639-1 code badge when `guestLanguage` differs from property language:

```
┌─────────────────────────────────────────┐
│ fa  Guest Name               2m ago     │
│ "I need extra towels please"            │
└─────────────────────────────────────────┘
```

**Message toggle** — Each message with `translatedContent` gets a toggle:

For **inbound** (guest → staff):
- Default: `translatedContent` (property language)
- Toggle "Show original": `content` (guest language)

For **outbound** (staff/AI → guest):
- Default: `content` (property language)
- Toggle "Show guest version": `translatedContent` (what guest received)

```tsx
const [showAlt, setShowAlt] = useState(false);

const displayContent = message.direction === 'inbound'
  ? (showAlt ? message.content : message.translatedContent ?? message.content)
  : (showAlt ? message.translatedContent : message.content);
```

**Property language setting** — Select dropdown in settings page. Reads/writes `property_language` in the `settings` table via the existing settings route pattern (same as `hotel_profile`, `auth_settings`).

#### How to Test Phase 4

```
1. Conversations list → language badges on non-property-language conversations
2. Open conversation → inbound messages show translation, toggle shows original
3. Outbound messages show property language, toggle shows guest version
4. Settings → change property language → new translations use the new language
```

---

## Related Documents

- [Web Chat Widget](./006-web-chat-widget.md) — Web chat is a channel that will use translation like all others
- [Architecture](../03-architecture/index.md) — Message processor and kernel/adapter architecture
