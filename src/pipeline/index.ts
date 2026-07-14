/**
 * Message processing pipeline — composition root for @thebutler/pipeline.
 *
 * This is the Butler pipeline: it wires the provider adapters
 * (`./adapters.js`) and stages (`./stages/`)
 * into a single `Pipeline` instance, and exposes
 * `processMessage(inbound, domain)` so channel call sites only need an
 * import-path change.
 *
 * Analogous to `src/index.ts` (the boot composition root) but scoped to
 * message processing — it's the only place allowed to bind
 * `@thebutler/pipeline`'s provider contracts to the app registry.
 *
 * The signature matches the legacy `the legacy pipeline` so
 * webchat / WhatsApp / SMS / Telegram can be migrated channel-by-channel.
 *
 * @module pipeline
 */

import {
  createPipeline,
  resolveConversation,
  detectLanguage,
  translateInbound,
  loadHistory,
  saveInboundMessage,
  classifyIntent,
  computeEmbedding,
  loadKnowledge,
  loadMemories,
  generateResponse,
  translateOutbound,
  saveOutboundMessage,
  type Pipeline,
  type Stage,
  type InboundMessage as PkgInboundMessage,
  type OutboundMessage as PkgOutboundMessage,
} from '@thebutler/pipeline';
import type { InboundMessage, OutboundMessage } from '@/types/message.js';
import { getPropertyLanguage } from '@/services/translation.js';
import type { ButlerContext } from './context.js';
import {
  aiProvider,
  conversationProvider,
  entityProvider,
  intentProvider,
  knowledgeProvider,
  loggerProvider,
  memoryProvider,
  promptProvider,
} from './adapters.js';
import { checkVerification } from './stages/check-verification.js';
import { extractResponseTags } from './stages/extract-response-tags.js';
import { emitMessageReceived } from './stages/emit-message-received.js';
import { emitMessageSent } from './stages/emit-message-sent.js';
import { routeTask } from './stages/route-task.js';

export type { ButlerContext } from './context.js';

// The pipeline is cached by `systemLanguage`. Every `processMessage` reads
// the current property language from settings; if it matches the cached
// value, the same Pipeline instance is reused. If it changed (admin updated
// the setting), the pipeline is rebuilt on the next inbound — no restart.
// Cost: one SQLite settings read per message; one Pipeline construction per
// language change. Rebuilds only on actual change.
let cached: { pipeline: Pipeline<ButlerContext>; lang: string } | null = null;

// Butler's stage order — explicit (Option A from the pipeline integration
// roadmap). The list is the package's `defaultStages` with Butler-side
// stages spliced in at the appropriate slots:
//   - `emitMessageReceived` after `saveInboundMessage` — fires
//     `MESSAGE_RECEIVED` on the event bus immediately after the inbound
//     is persisted, so the dashboard's live feed reacts without waiting
//     for the full pipeline to finish.
//   - `checkVerification` after `classifyIntent` — hospitality identity
//     verification (last name + confirmation number lookup).
//   - `routeTask` after `checkVerification` — creates a row in `tasks`
//     when the classified intent calls for staff action.
//   - `extractResponseTags` after `generateResponse` — pulls `[ACTION:...]`
//     and `[QUICK_REPLIES:...]` tags out of `aiResponse.content` into
//     `aiResponse.metadata` for the webchat UI; runs before translation so
//     `translateOutbound` operates on tag-free text.
//   - `emitMessageSent` after `saveOutboundMessage` — fires `MESSAGE_SENT`
//     once the outbound is durable.
const stages: readonly Stage<ButlerContext>[] = [
  resolveConversation,
  detectLanguage,
  translateInbound,
  loadHistory,
  saveInboundMessage,
  emitMessageReceived,
  classifyIntent,
  checkVerification,
  routeTask,
  computeEmbedding,
  loadKnowledge,
  loadMemories,
  generateResponse,
  extractResponseTags,
  translateOutbound,
  saveOutboundMessage,
  emitMessageSent,
];

function buildPipeline(systemLanguage: string): Pipeline<ButlerContext> {
  return createPipeline<ButlerContext>({
    intents: intentProvider,
    prompts: promptProvider,
    services: {
      entities: entityProvider,
      ai: aiProvider,
      conversation: conversationProvider,
      logger: loggerProvider,
      knowledge: knowledgeProvider,
      memory: memoryProvider,
    },
    systemLanguage,
    stages,
  });
}

async function getPipeline(): Promise<Pipeline<ButlerContext>> {
  const lang = await getPropertyLanguage();
  if (cached && cached.lang === lang) return cached.pipeline;
  cached = { pipeline: buildPipeline(lang), lang };
  return cached.pipeline;
}

/**
 * Process an inbound message through the pipeline. The active domain is
 * baked into `getPipeline()` (hospitality, for Butler); each call site
 * simply hands over the inbound message and receives the outbound reply.
 * On failure, the error propagates so the caller can decide what to do
 * (retry, send a fallback reply, alert oncall).
 */
export async function processMessage(
  inbound: InboundMessage,
): Promise<OutboundMessage> {
  const pipeline = await getPipeline();
  const ctx = await pipeline.process(toPkgInbound(inbound));
  return toButlerOutbound(ctx.outbound);
}

// Butler's `InboundMessage` carries `timestamp` + `contentType` + `raw`;
// the package's wire type uses `createdAt` and is text-only. These shape
// mappers bridge the two. Revisit when reviewing save-inbound /
// save-outbound stages — at that point we may align the underlying types
// instead of mapping at the edge.
function toPkgInbound(inbound: InboundMessage): PkgInboundMessage {
  return {
    id: inbound.id,
    channel: inbound.channel,
    channelId: inbound.channelId,
    content: inbound.content,
    createdAt: inbound.timestamp,
    ...(inbound.conversationId ? { conversationId: inbound.conversationId } : {}),
    ...(inbound.metadata ? { metadata: inbound.metadata } : {}),
  };
}

function toButlerOutbound(out: PkgOutboundMessage): OutboundMessage {
  return {
    conversationId: out.conversationId,
    content: out.content,
    contentType: 'text',
    ...(out.metadata ? { metadata: out.metadata } : {}),
  };
}
