/**
 * emitMessageReceived — Butler-side stage. Fires `MESSAGE_RECEIVED` on
 * Butler's event bus once the inbound has been persisted (i.e. right
 * after the package's `saveInboundMessage`).
 *
 * Consumers (WebSocket bridge, activity-log writer)
 * see new inbound messages in real time even while the rest of the
 * pipeline (classification, retrieval, response, translation, save) is
 * still running.
 *
 * Skips silently when prerequisites are missing — keeps the stage
 * harmless if `saveInboundMessage` was excluded from the list.
 *
 * @module pipeline/stages/emit-message-received
 */

import { events, EventTypes } from '@/events/index.js';
import type { Stage } from '@thebutler/pipeline';
import type { ChannelType } from '@jackthebutler/shared';
import type { ButlerContext } from '../context.js';

export const emitMessageReceived: Stage<ButlerContext> = async (ctx) => {
  if (!ctx.conversation || !ctx.savedInboundId) return;

  events.emit({
    type: EventTypes.MESSAGE_RECEIVED,
    conversationId: ctx.conversation.id,
    messageId: ctx.savedInboundId,
    channel: ctx.inbound.channel as ChannelType,
    content: ctx.inbound.content,
    contentType: 'text',
    ...(ctx.inboundLanguage ? { detectedLanguage: ctx.inboundLanguage } : {}),
    timestamp: new Date(),
  });
};
