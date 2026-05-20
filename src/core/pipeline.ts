/**
 * AI message pipeline — Stages 6 (response) + 2b (language).
 *
 * Glues @thebutler/pipeline into our domain: provider adapters over our
 * conversations/messages/customers/apps modules plus a custom stages
 * list:
 *
 *   resolveConversation
 *     → detectLanguage          (pkg)  ← labels customer turn
 *     → translateInbound        (pkg)  ← Farsi → default lang, when needed
 *     → enrichInboundMessage    (us)   ← UPDATE the already-saved row +
 *                                        emit 'message.updated'
 *     → loadPriorHistory        (us)   ← last N excluding inbound
 *     → generateResponse        (pkg)
 *     → translateOutbound       (pkg)  ← default lang → customer's lang
 *     → saveOutboundMessage     (pkg)  ← persists AI row via addMessage
 *
 * We skip intent classification, embeddings, RAG, and long-term memory —
 * those land in Stage 7.
 *
 * Cross-cutting infra (not a module), same as core/events.ts and
 * core/realtime.ts — modules call IN, this file calls into modules.
 *
 * Concurrency model: ingestInboundMessage persists the customer turn
 * synchronously and fires-and-forgets `runAiPipeline`. The pipeline
 * appends the AI reply via the conversation provider, which emits
 * `message.created`; the existing webchat/dashboard gateways pick it up
 * and push to subscribers.
 *
 * The pipeline holds `systemLanguage` (= business default language) at
 * `createPipeline` time. When the operator saves a new default, the
 * business service calls `rebuildPipeline()` so the next turn picks it
 * up without a restart.
 */
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  createPipeline,
  detectLanguage,
  generateResponse,
  resolveConversation,
  saveOutboundMessage,
  translateInbound,
  translateOutbound,
  type AIProvider,
  type ConversationProvider,
  type Conversation as PipelineConversation,
  type Entity,
  type EntityProvider,
  type InboundMessage,
  type Intent,
  type IntentProvider,
  type Logger,
  type Message as PipelineMessage,
  type Pipeline,
  type PromptProvider,
  type Stage,
} from '@thebutler/pipeline';
import type { GenerationMessage } from '@janetheoperator/shared/contracts';
import { db } from '@/db/client.js';
import {
  conversations,
  customers,
  messages,
  type Message,
} from '@/db/schema/index.js';
import { events } from '@/core/events.js';
import { logger as appLogger } from '@/core/logger.js';
import { getAssistant } from '@/modules/assistant/service.js';
import { getBusiness } from '@/modules/business/service.js';
import {
  getActiveGenerationInstance,
  recordAppCallResult,
} from '@/modules/apps/service.js';

/** Last N prior turns the responder gets as context. The user picked this. */
const HISTORY_LIMIT = 10;

/* ── ConversationProvider ──────────────────────────────────────── */

function toPipelineConversation(
  row: typeof conversations.$inferSelect,
): PipelineConversation {
  return {
    id: row.id,
    channel: row.channel,
    channelId: row.channelExternalId,
    entityId: row.customerId,
    createdAt: row.createdAt,
    updatedAt: row.lastMessageAt,
  };
}

function toPipelineMessage(row: Message, systemLang: string): PipelineMessage {
  // We persist authors as 'customer' | 'agent' | 'ai' | 'system'. For the
  // LLM, agent and ai are both "assistant" replies; system/event rows
  // never enter history (we filter them out in the SQL).
  //
  // History content is always surfaced in the system language: for
  // customer rows that's the translation (set by translateInbound) when
  // the customer wrote in a different language; for ai/agent rows the
  // content is already in the system language.
  const isSystemLang = !row.language || row.language === systemLang;
  const content = isSystemLang ? row.content : (row.translation ?? row.content);
  return {
    role: row.author === 'customer' ? 'user' : 'assistant',
    content,
    language: row.language ?? undefined,
    translation: row.translation ?? undefined,
  };
}

const conversationProvider: ConversationProvider = {
  async findOrCreate(channel, channelId, entityId) {
    // Normal ingest never hits this — the caller creates the conversation
    // before dispatching to the pipeline. The fallback exists so the
    // contract is honoured if a custom stage list ever reorders things.
    const existing = db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.channel, channel), eq(conversations.channelExternalId, channelId)),
      )
      .get();
    if (existing) return toPipelineConversation(existing);

    const id = randomUUID();
    const now = new Date();
    db.insert(conversations)
      .values({
        id,
        ref: 0,
        channel,
        channelExternalId: channelId,
        customerId: entityId,
        mode: 'ai',
        status: 'open',
        createdAt: now,
        lastMessageAt: now,
      })
      .run();
    const inserted = db.select().from(conversations).where(eq(conversations.id, id)).get();
    return toPipelineConversation(inserted!);
  },

  async findById(id) {
    const row = db.select().from(conversations).where(eq(conversations.id, id)).get();
    return row ? toPipelineConversation(row) : null;
  },

  async addMessage(conversationId, message) {
    const convo = db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get();
    if (!convo) throw new Error(`conversation_not_found: ${conversationId}`);

    const id = randomUUID();
    const now = new Date();
    // Pipeline only writes assistant turns through addMessage in our setup
    // (we persist the inbound ourselves before dispatching), so map both
    // roles defensively — but assistant is the expected path.
    const author = message.role === 'assistant' ? 'ai' : 'customer';
    const language = message.language ?? null;
    const translation = message.translation ?? null;
    db.insert(messages)
      .values({
        id,
        conversationId,
        author,
        content: message.content,
        language,
        translation,
        createdAt: now,
      })
      .run();
    db.update(conversations)
      .set({ lastMessageAt: now })
      .where(eq(conversations.id, conversationId))
      .run();

    events.emit('message.created', {
      conversationId,
      channel: convo.channel,
      channelExternalId: convo.channelExternalId,
      message: {
        id,
        author,
        content: message.content,
        language,
        translation,
        event: null,
        createdAt: now.getTime(),
      },
    });

    return { id };
  },

  async getRecentMessages(conversationId, limit) {
    // Newest-last, real messages only — drop lifecycle event markers and
    // internal 'system' rows that don't belong in LLM context. Content
    // is surfaced in the current system language (re-read fresh in case
    // the operator changed it between turns).
    const systemLang = getBusiness().defaultLanguage;
    const rows = db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          isNull(messages.event),
          ne(messages.author, 'system'),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .all();
    return rows.reverse().map((r) => toPipelineMessage(r, systemLang));
  },

  async setLanguage(conversationId, language) {
    // Persists the last detected customer language on the conversation so
    // a future one-turn detection failure ("ok", "thanks") can fall back
    // to this value. Called by @thebutler/pipeline's detectLanguage stage
    // (wired in Phase 2b).
    db.update(conversations)
      .set({ language })
      .where(eq(conversations.id, conversationId))
      .run();
  },
};

/* ── EntityProvider ────────────────────────────────────────────── */

const entityProvider: EntityProvider = {
  async resolve(inbound) {
    // Our ingest sets entityId on the conversation; this branch is only hit
    // when the pipeline is invoked from somewhere that didn't pre-resolve.
    const convo = inbound.conversationId
      ? db
          .select()
          .from(conversations)
          .where(eq(conversations.id, inbound.conversationId))
          .get()
      : undefined;
    return convo?.customerId ? { id: convo.customerId } : null;
  },

  async findById(id) {
    const row = db.select().from(customers).where(eq(customers.id, id)).get();
    return row ? ({ id: row.id } satisfies Entity) : null;
  },
};

/* ── IntentProvider (stub) ─────────────────────────────────────── */

const intentProvider: IntentProvider = {
  list(): readonly Intent[] {
    return [];
  },
  get() {
    return null;
  },
};

/* ── PromptProvider ────────────────────────────────────────────── */

/** Translator system prompt — shared by the pipeline's translate stages
 *  and the standalone `translateText` helper below so staff-reply translation
 *  matches AI-pipeline translation exactly. */
function translatorPrompt(from: string, to: string): string {
  return `You are a professional translator. Translate the user message from ${from} to ${to}. Preserve meaning, tone, register, and any formatting. Do not add commentary. Do not include the original text. Output only the translation.`;
}

const promptProvider: PromptProvider = {
  classifier: () => '',
  /** Prompts Claude (utility tier) to identify the inbound's language and
   *  return only a BCP-47 code. The package's detectLanguage stage is
   *  lenient and extracts a code-like token from whatever comes back. */
  detector: () =>
    'You are a language detector. Read the user message and respond with ONLY the BCP-47 language code (e.g. "en", "fa", "ar", "es"). Output nothing else — no quotes, no prose, no explanation. Just the code.',
  /** Translation between two BCP-47 codes. Used for both inbound
   *  (customer-lang → system-lang) and outbound (system-lang → customer-lang).
   *  We instruct the model to output only the translation so saveOutboundMessage
   *  can persist it verbatim. */
  translator: translatorPrompt,
  responder: (_ctx, env) => {
    // Build the system prompt from assistant_profile + business_profile.
    // Read at call time (not at pipeline-init) so operator edits to the
    // assistant persona / business name take effect on the next turn.
    const p = getAssistant();
    const b = getBusiness();
    const businessName = b.name.trim() || 'the business';
    const lines = [
      `You are ${p.name}, the support assistant for ${businessName}.`,
      `Voice: ${p.tone.toLowerCase()}.`,
    ];
    if (p.instructions.trim()) lines.push(`Additional instructions: ${p.instructions.trim()}`);
    if (p.topicsToAvoid.trim()) {
      lines.push(
        `Decline these topics politely and offer to connect a human: ${p.topicsToAvoid.trim()}.`,
      );
    }
    lines.push(
      `If you cannot help confidently, say: "${p.fallback.trim()}" and offer to connect a human.`,
    );
    // Always answer in the system language. The pipeline's translateOutbound
    // stage handles delivery to the customer's language; if we let Claude
    // pick the response language directly we'd skip that step and end up
    // with inconsistent storage (the dashboard reads `content`, which we
    // want in the system language regardless of customer language).
    lines.push(`Respond in ${env.systemLanguage}.`);
    return lines.join('\n');
  },
};

/* ── AIProvider (delegates to active generation app) ──────────── */

const AI_APP_ID = 'ai-anthropic';

const aiProvider: AIProvider = {
  name: 'jane-ai',
  async complete(request) {
    const instance = getActiveGenerationInstance();
    if (!instance) {
      throw new Error('no_active_generation_app');
    }
    const result = await instance.generate({
      messages: request.messages.map(
        (m): GenerationMessage => ({ role: m.role, content: m.content }),
      ),
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      // Forward the tier hint so detect/translate (utility) hit Haiku and
      // generate (reasoning) hits Opus/Sonnet — same routing the AI app
      // configures via its two model fields.
      modelTier: request.modelTier,
      // Forward `purpose` so providers/stubs can branch on intent
      // ('language_detection', 'translation', 'response_generation').
      purpose: request.purpose,
    });
    recordAppCallResult(AI_APP_ID, { ok: true });
    return { content: result.content, usage: result.usage };
  },
  async embed() {
    // Embedding stages are not in our pipeline. If they ever are, an
    // embedding-capable app needs to be wired here.
    throw new Error('embedding_not_supported');
  },
};

/* ── Logger adapter ────────────────────────────────────────────── */

const pipelineLogger: Logger = {
  debug: (fields, message) => appLogger.debug(fields, message),
  info: (fields, message) => appLogger.info(fields, message),
  warn: (fields, message) => appLogger.warn(fields, message),
  error: (fields, message) => appLogger.error(fields, message),
};

/* ── Custom stages ─────────────────────────────────────────────── */

/**
 * Replacement for the default `loadHistory`. We've already persisted the
 * customer turn synchronously (so the dashboard sees it instantly), so
 * the conversation row already contains the current inbound — we must
 * exclude it from history or the responder sees it twice (history +
 * the user-message generateResponse appends).
 *
 * Reads our DB directly. Excludes by inbound.id (we set it = our DB
 * messageId in the ingest call). Returns system-language text per the
 * toPipelineMessage rule.
 */
const loadPriorHistory: Stage = async (ctx, env) => {
  if (!ctx.conversation) return;
  const rows = db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, ctx.conversation.id),
        isNull(messages.event),
        ne(messages.author, 'system'),
        ne(messages.id, ctx.inbound.id),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .all();
  // Keep only the trailing N — older turns drop off.
  ctx.history = rows
    .slice(-HISTORY_LIMIT)
    .map((r) => toPipelineMessage(r, env.systemLanguage));
};

/**
 * Patches the already-saved inbound row with the detected language and
 * translation, then emits `'message.updated'` so the dashboard can
 * patch its cached copy. Replaces the default `saveInboundMessage`
 * stage — we skip that one because we persist inbound at ingest time
 * (before the pipeline runs) so the dashboard sees the message instantly.
 *
 * Runs after `translateInbound` so both `ctx.inboundLanguage` and
 * `ctx.inboundTranslation` are populated (translation only when the
 * customer's language differs from system).
 */
const enrichInboundMessage: Stage = async (ctx, _env) => {
  if (!ctx.conversation) return;
  const language = ctx.inboundLanguage ?? null;
  const translation = ctx.inboundTranslation ?? null;

  db.update(messages)
    .set({ language, translation })
    .where(eq(messages.id, ctx.inbound.id))
    .run();

  events.emit('message.updated', {
    conversationId: ctx.conversation.id,
    channel: ctx.conversation.channel,
    channelExternalId: ctx.conversation.channelId,
    messageId: ctx.inbound.id,
    language,
    translation,
  });
};

/* ── The pipeline ─────────────────────────────────────────────── */

function buildPipeline(): Pipeline {
  // Reads systemLanguage fresh from business_profile. Called on init and
  // on every business-settings save (see business/service.ts).
  return createPipeline({
    intents: intentProvider,
    prompts: promptProvider,
    services: {
      entities: entityProvider,
      ai: aiProvider,
      conversation: conversationProvider,
      logger: pipelineLogger,
    },
    systemLanguage: getBusiness().defaultLanguage,
    stages: [
      resolveConversation,
      detectLanguage,
      translateInbound,
      enrichInboundMessage,
      loadPriorHistory,
      generateResponse,
      translateOutbound,
      saveOutboundMessage,
    ],
  });
}

// Lazy-built on first runAiPipeline() call. Module-init build would trip
// a circular import (business/service.ts imports rebuildPipeline; pipeline.ts
// imports getBusiness — both work fine at call time, not at module-load).
let pipeline: Pipeline | undefined;
function getPipeline(): Pipeline {
  if (!pipeline) pipeline = buildPipeline();
  return pipeline;
}

/** Called by the business service after saveBusiness so a default-language
 *  change takes effect on the next turn without restarting the server. */
export function rebuildPipeline(): void {
  pipeline = buildPipeline();
}

export interface AiPipelineInput {
  conversationId: string;
  channel: string;
  channelExternalId: string;
  messageId: string;
  content: string;
  createdAt: Date;
}

/**
 * Fire-and-forget entry point. Caller already persisted the customer
 * turn; this kicks the AI reply pipeline. Errors are logged + recorded
 * on the AI app's `last_error` (so the operator sees them in the strip)
 * but never thrown — by design, the public webchat path stays alive
 * even when generation fails.
 */
export function runAiPipeline(input: AiPipelineInput): void {
  const inbound: InboundMessage = {
    id: input.messageId,
    channel: input.channel,
    channelId: input.channelExternalId,
    conversationId: input.conversationId,
    content: input.content,
    createdAt: input.createdAt,
  };
  void getPipeline()
    .process(inbound)
    .catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : 'pipeline failed';
      appLogger.error({ err, conversationId: input.conversationId }, 'ai pipeline failed');
      recordAppCallResult(AI_APP_ID, { ok: false, detail });
    });
}

/**
 * One-shot translation helper. Used by the staff-reply path
 * (`conversations/service.ts > reply`) so an agent typing in the business
 * default language is delivered to the customer in their own language.
 *
 * Reuses the same translator prompt + utility-tier routing the AI
 * pipeline uses internally. Returns `null` and logs on failure (or when
 * no generation app is configured) so the agent reply still goes out in
 * the default language rather than blocking on AI availability.
 */
export async function translateText(
  text: string,
  from: string,
  to: string,
): Promise<string | null> {
  if (!text.trim() || from === to) return null;
  const instance = getActiveGenerationInstance();
  if (!instance) return null;
  try {
    const result = await instance.generate({
      modelTier: 'utility',
      purpose: 'translation',
      maxTokens: 1024,
      messages: [
        { role: 'system', content: translatorPrompt(from, to) },
        { role: 'user', content: text },
      ],
    });
    const translated = result.content.trim();
    return translated.length > 0 ? translated : null;
  } catch (err) {
    appLogger.error({ err, from, to }, 'staff-reply translation failed');
    return null;
  }
}

