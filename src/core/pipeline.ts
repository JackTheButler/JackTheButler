/**
 * AI message pipeline — Stage 6.
 *
 * Glues @thebutler/pipeline into our domain: provider adapters over our
 * conversations/messages/customers/apps modules, plus a custom 4-stage list
 * (resolveConversation → loadPriorHistory → generateResponse →
 * saveOutboundMessage). We skip language detection, translation, intent
 * classification, embeddings, RAG, and long-term memory — none of which
 * Stage 6 needs.
 *
 * Cross-cutting infra (not a module), same as core/events.ts and
 * core/realtime.ts — modules call IN, this file calls into modules.
 *
 * Concurrency model: ingestInboundMessage persists the customer turn
 * synchronously and fires-and-forgets `runAiPipeline`. The pipeline
 * appends the AI reply via the conversation provider, which emits
 * `message.created`; the existing webchat/dashboard gateways pick it up
 * and push to subscribers.
 */
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  createPipeline,
  generateResponse,
  resolveConversation,
  saveOutboundMessage,
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

function toPipelineMessage(row: Message): PipelineMessage {
  // We persist authors as 'customer' | 'agent' | 'ai' | 'system'. For the
  // LLM, agent and ai are both "assistant" replies; system/event rows
  // never enter history (we filter them out in the SQL).
  return {
    role: row.author === 'customer' ? 'user' : 'assistant',
    content: row.content,
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
    db.insert(messages)
      .values({ id, conversationId, author, content: message.content, createdAt: now })
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
        event: null,
        createdAt: now.getTime(),
      },
    });

    return { id };
  },

  async getRecentMessages(conversationId, limit) {
    // Newest-last, real messages only — drop lifecycle event markers and
    // internal 'system' rows that don't belong in LLM context.
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
    return rows.reverse().map(toPipelineMessage);
  },

  async setLanguage() {
    // Single-language deployment — no-op until we add detectLanguage.
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

const promptProvider: PromptProvider = {
  classifier: () => '',
  detector: () => '',
  translator: () => '',
  responder: () => {
    // Build the system prompt from assistant_profile. Read at call time
    // (not at startup) so operator edits take effect on the next turn.
    const p = getAssistant();
    const lines = [
      `You are ${p.name}, the support assistant.`,
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

/* ── Custom history stage ──────────────────────────────────────── */

/**
 * Replacement for the default `loadHistory`. We've already persisted the
 * customer turn synchronously (so the dashboard sees it instantly), so
 * the conversation row already contains the current inbound — we must
 * exclude it from history or the responder sees it twice (history +
 * the user-message generateResponse appends).
 *
 * Reads our DB directly. Excludes by inbound.id (we set it = our DB
 * messageId in the ingest call).
 */
const loadPriorHistory: Stage = async (ctx, _env) => {
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
  ctx.history = rows.slice(-HISTORY_LIMIT).map(toPipelineMessage);
};

/* ── The pipeline ─────────────────────────────────────────────── */

const pipeline = createPipeline({
  intents: intentProvider,
  prompts: promptProvider,
  services: {
    entities: entityProvider,
    ai: aiProvider,
    conversation: conversationProvider,
    logger: pipelineLogger,
  },
  stages: [resolveConversation, loadPriorHistory, generateResponse, saveOutboundMessage],
});

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
  void pipeline.process(inbound).catch((err: unknown) => {
    const detail = err instanceof Error ? err.message : 'pipeline failed';
    appLogger.error({ err, conversationId: input.conversationId }, 'ai pipeline failed');
    recordAppCallResult(AI_APP_ID, { ok: false, detail });
  });
}

