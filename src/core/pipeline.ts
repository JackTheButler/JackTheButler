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
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  computeEmbedding,
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
  type KnowledgeHit,
  type KnowledgeProvider,
  type Logger,
  type Message as PipelineMessage,
  type Pipeline,
  type PromptProvider,
  type Stage,
} from '@thebutler/pipeline';
import type { GenerationMessage } from '@janetheoperator/shared/contracts';
import type { KnowledgeHitDTO } from '@janetheoperator/shared';
import { buildResponsePrompt } from '@/modules/knowledge/answer.js';
import { db } from '@/db/client.js';
import {
  conversations,
  customers,
  knowledgeEntries,
  messages,
  type Message,
} from '@/db/schema/index.js';
import { events } from '@/core/events.js';
import { logger as appLogger } from '@/core/logger.js';
import { getBusiness } from '@/modules/business/service.js';
import { getKbMinSimilarity, getKbTopK } from '@/modules/knowledge/service.js';
import { searchKnowledge, type KnowledgeMatch } from '@/modules/knowledge/search.js';
import {
  getActiveEmbeddingInstance,
  getActiveGenerationInstance,
  recordAppCallResult,
} from '@/modules/apps/service.js';

/** Last N prior turns the responder gets as context. The user picked this. */
const HISTORY_LIMIT = 10;

// Both retrieval ceilings are operator-tunable and read per-turn from the
// KB settings: top-K via getKbTopK(), the cosine floor (match strictness)
// via getKbMinSimilarity().


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

/** Language-detector system prompt — shared by the pipeline's detectLanguage
 *  stage (via promptProvider.detector) and the standalone `detectTextLanguage`
 *  helper below, so sandbox detection matches AI-pipeline detection exactly. */
const DETECTOR_PROMPT =
  'You are a language detector. Read the user message and respond with ONLY the BCP-47 language code (e.g. "en", "fa", "ar", "es"). Output nothing else — no quotes, no prose, no explanation. Just the code.';

const promptProvider: PromptProvider = {
  classifier: () => '',
  /** Prompts Claude (utility tier) to identify the inbound's language and
   *  return only a BCP-47 code. The package's detectLanguage stage is
   *  lenient and extracts a code-like token from whatever comes back. */
  detector: () => DETECTOR_PROMPT,
  /** Translation between two BCP-47 codes. Used for both inbound
   *  (customer-lang → system-lang) and outbound (system-lang → customer-lang).
   *  We instruct the model to output only the translation so saveOutboundMessage
   *  can persist it verbatim. */
  translator: translatorPrompt,
  responder: (ctx, env) => {
    // Shared with the KB test sandbox (modules/knowledge/answer.ts) so both
    // speak in the same persona/voice/length and KB grounding. Built at call
    // time so operator edits take effect on the next turn. We always answer in
    // the system language; translateOutbound delivers the customer's language.
    const prompt = buildResponsePrompt(ctx.knowledgeHits ?? [], env.systemLanguage);
    appLogger.debug({ messageId: ctx.inbound.id, systemPrompt: prompt }, 'responder prompt');
    return prompt;
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
  async embed(request) {
    // Delegates to the active embedding app. Throwing when none is active
    // is fine — the computeEmbedding stage catches + warns, then
    // loadKnowledge no-ops, so the AI answers from persona alone.
    const instance = getActiveEmbeddingInstance();
    if (!instance) throw new Error('no_active_embedding_app');
    const result = await instance.embed({ texts: [request.text] });
    const vector = result.vectors[0];
    if (!vector || vector.length === 0) throw new Error('empty_embedding');
    return { embedding: vector };
  },
};

/* ── KnowledgeProvider (KB vector search) ──────────────────────── */

/** Map a domain search match to the pipeline's KnowledgeHit. Title carries
 *  the matched question (+ topic for context); content is the answer the AI
 *  reads. Both are rendered by `responder`. */
function toHit(m: KnowledgeMatch): KnowledgeHit {
  return {
    id: m.id,
    title: m.topic ? `${m.topic}: ${m.question}` : m.question,
    content: m.answer,
    similarity: m.similarity,
  };
}

const knowledgeProvider: KnowledgeProvider = {
  async search(embedding, options) {
    const { hits } = searchKnowledge(
      embedding,
      options?.limit ?? getKbTopK(),
      options?.minSimilarity ?? getKbMinSimilarity(),
    );
    return hits.map(toHit);
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

  // Visibility: detected language + the original/translated pair, so a turn's
  // language handling is debuggable in one line.
  appLogger.debug(
    {
      messageId: ctx.inbound.id,
      detectedLang: language,
      original: ctx.inbound.content,
      translation, // null when same language as system (no translation ran)
    },
    'inbound language',
  );
};

/**
 * Custom replacement for the package's `loadKnowledge` (which hardcodes
 * limit 3 / minSimilarity 0.5). Same behaviour, our retrieval ceilings.
 * No-ops cleanly when computeEmbedding produced no vector (no embedding
 * app active) — the responder then answers from persona alone.
 */
const loadKnowledge: Stage = async (ctx, env) => {
  if (!ctx.inboundEmbedding) return;
  try {
    const minSim = getKbMinSimilarity();
    const { hits, candidates, bestScore } = searchKnowledge(
      ctx.inboundEmbedding,
      getKbTopK(),
      minSim,
    );
    const knowledgeHits = hits.map(toHit);
    ctx.knowledgeHits = knowledgeHits;
    appLogger.debug(
      {
        messageId: ctx.inbound.id,
        // The system-language text that was embedded + searched.
        query: ctx.inboundTranslation ?? ctx.inbound.content,
        candidates, // approved + embedded entries scanned (0 ⇒ KB empty / unembedded)
        threshold: minSim,
        bestScore: bestScore === null ? null : Number(bestScore.toFixed(3)),
        returned: knowledgeHits.map((h) => ({
          title: h.title,
          score: Number(h.similarity.toFixed(3)),
        })),
      },
      'kb search',
    );
  } catch (err) {
    env.services.logger.warn({ err }, 'knowledge search failed');
  }
};

/**
 * Announce that the assistant is composing a reply — emitted after the inbound
 * turn is resolved/translated and history is loaded, just before the slower
 * retrieval + generation work, so the "typing…" indicator covers that stretch.
 * The eventual saveOutboundMessage → message.created ends it.
 */
const signalTyping: Stage = async (ctx, _env) => {
  if (!ctx.conversation) return;
  events.emit('assistant.typing', {
    conversationId: ctx.conversation.id,
    channel: ctx.conversation.channel,
    channelExternalId: ctx.conversation.channelId,
  });
};

/**
 * Logs the AI's reply in the system language — i.e. exactly what the model
 * produced, before `translateOutbound` rewrites it into the customer's
 * language. Sits between generateResponse and translateOutbound so the trace
 * shows the original answer next to the prompt that produced it; the delivered
 * (translated) text is separately visible on the saved message.
 */
const logGeneratedResponse: Stage = async (ctx, _env) => {
  if (!ctx.aiResponse) return;
  appLogger.debug(
    {
      messageId: ctx.inbound.id,
      systemLanguage: getBusiness().defaultLanguage,
      response: ctx.aiResponse.content,
    },
    'ai response (pre-translation)',
  );
};

/**
 * Retrieval transparency. After the AI reply is saved (so `ctx.outbound.id`
 * exists), snapshot the knowledge entries it used onto that message row and
 * announce them via `message.knowledge` so the dashboard can show "answered
 * from N entries". We re-read question/answer/topic from the entries by id —
 * the same instant as retrieval, so identical to what the model saw — which
 * keeps KB-consistent field names and avoids parsing the combined prompt title
 * (a ':' in a topic could otherwise corrupt a split). No-ops when there were no
 * hits (e.g. the strict-grounding fallback path).
 */
const persistKnowledgeHits: Stage = async (ctx, _env) => {
  const messageId = ctx.outbound?.id;
  const hits = ctx.knowledgeHits ?? [];
  if (!messageId || !ctx.conversation || hits.length === 0) return;

  const rows = db
    .select({
      id: knowledgeEntries.id,
      question: knowledgeEntries.question,
      answer: knowledgeEntries.answer,
      topic: knowledgeEntries.topic,
    })
    .from(knowledgeEntries)
    .where(
      inArray(
        knowledgeEntries.id,
        hits.map((h) => h.id),
      ),
    )
    .all();
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Preserve retrieval order + similarity; skip any entry deleted in between.
  const snapshot: KnowledgeHitDTO[] = hits.flatMap((h) => {
    const e = byId.get(h.id);
    return e
      ? [{ id: e.id, question: e.question, answer: e.answer, topic: e.topic, similarity: h.similarity }]
      : [];
  });
  if (snapshot.length === 0) return;

  db.update(messages)
    .set({ knowledgeHits: JSON.stringify(snapshot) })
    .where(eq(messages.id, messageId))
    .run();

  events.emit('message.knowledge', {
    conversationId: ctx.conversation.id,
    messageId,
    knowledgeHits: snapshot,
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
      knowledge: knowledgeProvider,
      logger: pipelineLogger,
    },
    systemLanguage: getBusiness().defaultLanguage,
    stages: [
      resolveConversation,
      detectLanguage,
      translateInbound,
      enrichInboundMessage,
      loadPriorHistory,
      // Signal "typing…" once the inbound turn is resolved/translated, before
      // the slower retrieval + generation work.
      signalTyping,
      // KB retrieval: embed the (translated) question, search, attach hits.
      // computeEmbedding embeds `inboundTranslation ?? inbound.content`, so a
      // Farsi question searches the English KB via its translation.
      computeEmbedding,
      loadKnowledge,
      generateResponse,
      logGeneratedResponse,
      translateOutbound,
      saveOutboundMessage,
      // After the reply row exists, attach + announce the entries it used.
      persistKnowledgeHits,
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
    .then((ctx) => {
      // One structured line per turn (info). Grep `messageId` to follow a
      // single turn across the debug lines from responder + loadKnowledge.
      appLogger.info(turnSummary(ctx, 'ok'), 'ai turn');
    })
    .catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : 'pipeline failed';
      // PipelineError carries the partial ctx at the point of failure, so we
      // can still log how far the turn got.
      const ctx = (err as { ctx?: PipelineTurnCtx })?.ctx;
      appLogger.error(
        { ...turnSummary(ctx, 'error'), err, conversationId: input.conversationId },
        'ai turn failed',
      );
      recordAppCallResult(AI_APP_ID, { ok: false, detail });
    });
}

/** Subset of MessageContext the trace reads. Loose because PipelineError's
 *  ctx may be partial. */
interface PipelineTurnCtx {
  inbound?: { id?: string; channel?: string };
  conversation?: { id?: string };
  startTime?: number;
  inboundLanguage?: string;
  inboundTranslation?: string;
  history?: readonly unknown[];
  knowledgeHits?: readonly { similarity: number }[];
  aiResponse?: { usage?: { inputTokens: number; outputTokens: number } };
}

/** Flatten a turn's ctx into a structured log object. */
function turnSummary(
  ctx: PipelineTurnCtx | undefined,
  outcome: 'ok' | 'error',
): Record<string, unknown> {
  const hits = ctx?.knowledgeHits ?? [];
  return {
    outcome,
    messageId: ctx?.inbound?.id,
    conversationId: ctx?.conversation?.id,
    channel: ctx?.inbound?.channel,
    inboundLang: ctx?.inboundLanguage,
    translated: !!ctx?.inboundTranslation,
    historyTurns: ctx?.history?.length ?? 0,
    kbHits: hits.length,
    kbTopScore: hits.length > 0 ? Number(hits[0].similarity.toFixed(3)) : null,
    tokens: ctx?.aiResponse?.usage
      ? { in: ctx.aiResponse.usage.inputTokens, out: ctx.aiResponse.usage.outputTokens }
      : null,
    durationMs: ctx?.startTime ? Date.now() - ctx.startTime : null,
  };
}

/**
 * One-shot language detection. Returns a BCP-47 code (e.g. 'en', 'fa') or
 * `null` when detection fails or no generation app is configured. Reuses the
 * same detector prompt + utility-tier routing the AI pipeline's detectLanguage
 * stage uses, and parses the reply leniently (the model may wrap the code), so
 * the KB test sandbox detects exactly as live chat does.
 */
export async function detectTextLanguage(text: string): Promise<string | null> {
  if (!text.trim()) return null;
  const instance = getActiveGenerationInstance();
  if (!instance) return null;
  try {
    const result = await instance.generate({
      modelTier: 'utility',
      purpose: 'language_detection',
      maxTokens: 16,
      messages: [
        { role: 'system', content: DETECTOR_PROMPT },
        { role: 'user', content: text },
      ],
    });
    // Extract the first code-like token (e.g. "en", "fa", "pt-BR").
    const code = result.content.trim().match(/[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)?/)?.[0];
    return code ? code.toLowerCase() : null;
  } catch (err) {
    appLogger.warn({ err }, 'language detection failed');
    return null;
  }
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

