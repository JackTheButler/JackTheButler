import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type {
  ConversationDetail,
  ConversationSummary,
  KnowledgeHitDTO,
  MessageDTO,
} from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import {
  conversations,
  customerIdentities,
  customers,
  messages,
  type Conversation,
} from '@/db/schema/index.js';
import { AppError } from '@/core/errors.js';
import { events } from '@/core/events.js';
import { runAiPipeline, translateText } from '@/core/pipeline.js';
import { getActiveGenerationInstance } from '@/modules/apps/service.js';
import { getBusiness } from '@/modules/business/service.js';

/**
 * Transport-agnostic conversation logic. The seam every channel calls.
 *
 * Identity policy: strong channels (WhatsApp/Telegram) resolve-or-create a
 * customer via `customer_identities`. Anonymous webchat gets NO customer —
 * the conversation is keyed by `(channel, channelExternalId)` only.
 */

const STRONG_CHANNELS = new Set(['whatsapp', 'telegram']);

function ms(d: Date): number {
  return d.getTime();
}

/** Single mapping from DB row → MessageDTO so every read path (getConversation,
 *  getPublicHistory) and every emit (ingest, reply, pipeline addMessage) stays
 *  in sync as the message shape evolves. */
function toMessageDTO(row: {
  id: string;
  author: 'customer' | 'agent' | 'ai' | 'system';
  content: string;
  language: string | null;
  translation: string | null;
  event: string | null;
  createdAt: Date;
}): MessageDTO {
  return {
    id: row.id,
    author: row.author,
    content: row.content,
    language: row.language,
    translation: row.translation,
    event: row.event,
    createdAt: row.createdAt.getTime(),
  };
}

/** Parse the stored knowledge-hits snapshot. Returns undefined when absent so
 *  the DTO field is simply omitted (and stays off the public history path,
 *  which never reads this column). */
function parseKnowledgeHits(json: string | null): KnowledgeHitDTO[] | undefined {
  if (!json) return undefined;
  try {
    const hits = JSON.parse(json) as KnowledgeHitDTO[];
    return hits.length ? hits : undefined;
  } catch {
    return undefined;
  }
}

function getOrThrow(id: string): Conversation {
  const c = db.select().from(conversations).where(eq(conversations.id, id)).get();
  if (!c) throw new AppError('conversation_not_found', 404);
  return c;
}

/** Lightweight routing metadata for a conversation — used by notification
 *  wiring to decide who to alert without loading the full thread. */
export function getConversationMeta(
  id: string,
): { mode: 'ai' | 'human'; assignedAgentId: string | null } | null {
  const c = db
    .select({ mode: conversations.mode, assignedAgentId: conversations.assignedAgentId })
    .from(conversations)
    .where(eq(conversations.id, id))
    .get();
  return c ?? null;
}

function resolveCustomerId(
  channel: string,
  externalId: string,
  name?: string,
  contact?: string,
): string | null {
  if (!STRONG_CHANNELS.has(channel)) return null; // anonymous — no customer

  const existing = db
    .select()
    .from(customerIdentities)
    .where(
      and(
        eq(customerIdentities.channel, channel),
        eq(customerIdentities.externalId, externalId),
      ),
    )
    .get();
  if (existing) return existing.customerId;

  const customerId = randomUUID();
  const now = new Date();
  db.insert(customers)
    .values({ id: customerId, name: name ?? null, contact: contact ?? null, createdAt: now })
    .run();
  db.insert(customerIdentities)
    .values({ id: randomUUID(), channel, externalId, customerId, createdAt: now })
    .run();
  return customerId;
}

export interface IngestInput {
  channel: string;
  externalId: string;
  content: string;
  name?: string;
  contact?: string;
}

export function ingestInboundMessage(
  input: IngestInput,
): { conversationId: string; messageId: string } {
  const { channel, externalId, content, name, contact } = input;

  const result = db.transaction(() => {
    const customerId = resolveCustomerId(channel, externalId, name, contact);
    const now = new Date();

    // One conversation per identity per channel (continuous conversation).
    let convo = db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.channel, channel),
          eq(conversations.channelExternalId, externalId),
        ),
      )
      .get();

    if (!convo) {
      const next = db
        .select({ m: sql<number>`coalesce(max(${conversations.ref}), 0)` })
        .from(conversations)
        .get();
      const id = randomUUID();
      db.insert(conversations)
        .values({
          id,
          ref: (next?.m ?? 0) + 1,
          channel,
          channelExternalId: externalId,
          customerId,
          mode: 'ai',
          status: 'open',
          createdAt: now,
          lastMessageAt: now,
        })
        .run();
      convo = getOrThrow(id);
    } else {
      // Continuous conversation: reopen if closed. Reopen re-binds takeover
      // to the new episode (mode→ai, unassigned) and drops a segment marker
      // for the UI / pipeline / analytics.
      if (convo.status === 'closed') {
        db.update(conversations)
          .set({ status: 'open', mode: 'ai', assignedAgentId: null, needsHuman: false })
          .where(eq(conversations.id, convo.id))
          .run();
        db.insert(messages)
          .values({
            id: randomUUID(),
            conversationId: convo.id,
            author: 'system',
            content: '',
            event: 'reopened',
            createdAt: now,
          })
          .run();
      }
      if (customerId && !convo.customerId) {
        // Promotion: an anonymous conversation later identified.
        db.update(conversations)
          .set({ customerId })
          .where(eq(conversations.id, convo.id))
          .run();
      }
    }

    const messageId = randomUUID();
    db.insert(messages)
      .values({
        id: messageId,
        conversationId: convo.id,
        author: 'customer',
        content,
        createdAt: now,
      })
      .run();
    db.update(conversations)
      .set({ lastMessageAt: now })
      .where(eq(conversations.id, convo.id))
      .run();

    return {
      conversationId: convo.id,
      messageId,
      channel: convo.channel,
      channelExternalId: convo.channelExternalId,
      createdAtMs: now.getTime(),
      mode: convo.mode,
      now,
    };
  });

  events.emit('message.created', {
    conversationId: result.conversationId,
    channel: result.channel,
    channelExternalId: result.channelExternalId,
    message: {
      id: result.messageId,
      author: 'customer',
      content,
      // Language + translation are filled in by the pipeline's
      // enrichInboundMessage stage (Phase 2b). Phase 2a emits null/null
      // so the dashboard sees the message instantly with no language
      // info; a later 'message.updated' will patch it.
      language: null,
      translation: null,
      event: null,
      createdAt: result.createdAtMs,
    },
  });

  // Dispatch the AI reply pipeline when this conversation is in AI mode and
  // a generation provider is active. Fire-and-forget — the customer-side
  // 'message.created' event above has already updated the UI; the AI reply
  // arrives later via the same event from inside the pipeline.
  if (result.mode === 'ai' && getActiveGenerationInstance() !== null) {
    runAiPipeline({
      conversationId: result.conversationId,
      channel: result.channel,
      channelExternalId: result.channelExternalId,
      messageId: result.messageId,
      content,
      createdAt: result.now,
    });
  }

  return { conversationId: result.conversationId, messageId: result.messageId };
}

/** Last *real* message (ignores lifecycle event markers). */
function lastMessage(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), isNull(messages.event)))
    .orderBy(desc(messages.createdAt))
    .get();
}

export function listConversations(status?: 'open' | 'closed'): ConversationSummary[] {
  const rows = db
    .select()
    .from(conversations)
    .where(status ? eq(conversations.status, status) : undefined)
    .orderBy(desc(conversations.lastMessageAt))
    .all();

  return rows.map((c) => {
    const last = lastMessage(c.id);
    const customer = c.customerId
      ? db.select().from(customers).where(eq(customers.id, c.customerId)).get()
      : undefined;
    return {
      id: c.id,
      ref: c.ref,
      channel: c.channel,
      mode: c.mode,
      status: c.status,
      customerName: customer?.name ?? null,
      snippet: last?.content ?? '',
      needsReply: c.status === 'open' && last?.author === 'customer',
      needsHuman: c.needsHuman,
      lastMessageAt: ms(c.lastMessageAt),
    };
  });
}

export function getConversation(id: string): ConversationDetail {
  const c = getOrThrow(id);
  const customer = c.customerId
    ? db.select().from(customers).where(eq(customers.id, c.customerId)).get()
    : undefined;
  const msgs = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt)
    .all();

  return {
    id: c.id,
    ref: c.ref,
    channel: c.channel,
    mode: c.mode,
    status: c.status,
    customer: customer
      ? { id: customer.id, name: customer.name, contact: customer.contact }
      : null,
    language: c.language,
    // Dashboard read path attaches retrieval transparency; the public history
    // (getPublicHistory) deliberately uses toMessageDTO without it.
    messages: msgs.map((m) => ({
      ...toMessageDTO(m),
      knowledgeHits: parseKnowledgeHits(m.knowledgeHits),
    })),
  };
}

/** Customer-visible history for a channel identity (no system/event markers).
 *  Empty if no conversation yet. Used by the public widget. */
export function getPublicHistory(channel: string, externalId: string): MessageDTO[] {
  const convo = db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.channel, channel),
        eq(conversations.channelExternalId, externalId),
      ),
    )
    .get();
  if (!convo) return [];
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, convo.id), isNull(messages.event)))
    .orderBy(messages.createdAt)
    .all()
    .filter((m) => m.author !== 'system')
    .map(toMessageDTO);
}

/** Broadcast that an agent is composing a reply, so the customer's widget
 *  shows a typing indicator. Fire-and-forget, throttled by the caller (the
 *  composer). No-op on a closed conversation. */
export function notifyStaffTyping(id: string): void {
  const c = getOrThrow(id);
  if (c.status === 'closed') return;
  events.emit('staff.typing', {
    conversationId: id,
    channel: c.channel,
    channelExternalId: c.channelExternalId,
  });
}

export async function reply(
  id: string,
  agentId: string,
  content: string,
  translate = true,
): Promise<ConversationDetail> {
  const c = getOrThrow(id);
  if (c.status === 'closed') throw new AppError('conversation_closed', 409);
  if (c.mode !== 'human') throw new AppError('takeover_required', 409);

  // Translate to the customer's language when known + different from default,
  // unless the agent opted out for this reply. Graceful: if no AI app is active
  // or translation fails, `translation` stays null, the customer reads the
  // default-language version, and the agent's reply still goes out.
  const defaultLang = getBusiness().defaultLanguage;
  const customerLang = c.language;
  const needsTranslation = translate && !!customerLang && customerLang !== defaultLang;
  const translation = needsTranslation
    ? await translateText(content, defaultLang, customerLang)
    : null;

  const now = new Date();
  const messageId = randomUUID();
  db.insert(messages)
    .values({
      id: messageId,
      conversationId: id,
      author: 'agent',
      senderAgentId: agentId,
      content,
      language: defaultLang,
      translation,
      createdAt: now,
    })
    .run();
  db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, id)).run();

  events.emit('message.created', {
    conversationId: id,
    channel: c.channel,
    channelExternalId: c.channelExternalId,
    message: {
      id: messageId,
      author: 'agent',
      content,
      language: defaultLang,
      translation,
      event: null,
      createdAt: now.getTime(),
    },
  });

  return getConversation(id);
}

export function takeover(id: string, agentId: string): ConversationDetail {
  const c = getOrThrow(id);
  if (c.mode !== 'ai') throw new AppError('invalid_transition', 409);
  db.update(conversations)
    .set({ mode: 'human', assignedAgentId: agentId, needsHuman: false })
    .where(eq(conversations.id, id))
    .run();
  return getConversation(id);
}

export function handback(id: string): ConversationDetail {
  const c = getOrThrow(id);
  if (c.mode !== 'human') throw new AppError('invalid_transition', 409);
  db.update(conversations)
    .set({ mode: 'ai', assignedAgentId: null })
    .where(eq(conversations.id, id))
    .run();
  return getConversation(id);
}

export function setStatus(id: string, status: 'open' | 'closed'): ConversationDetail {
  getOrThrow(id);
  // Any status change ends the current escalation (resolved, or reopened fresh).
  db.update(conversations).set({ status, needsHuman: false }).where(eq(conversations.id, id)).run();
  return getConversation(id);
}
