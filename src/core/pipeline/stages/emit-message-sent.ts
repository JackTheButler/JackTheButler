/**
 * emitMessageSent — Butler-side stage. Fires `MESSAGE_SENT` on Butler's
 * event bus once the outbound has been persisted (i.e. right after the
 * package's `saveOutboundMessage`).
 *
 * Consumers (WebSocket bridge, activity-log writer) see new outbound
 * messages in real time as soon as they're durable.
 *
 * The persisted message's id is on `ctx.outbound.id` — populated by
 * `saveOutboundMessage` from the `ConversationProvider.addMessage` return.
 *
 * @module core/pipeline/stages/emit-message-sent
 */

import { events, EventTypes } from '@/events/index.js';
import type { Stage } from '@thebutler/pipeline';
import type { ChannelType } from '@jackthebutler/shared';
import type { ButlerContext } from '../index.js';

export const emitMessageSent: Stage<ButlerContext> = async (ctx) => {
  if (!ctx.conversation || !ctx.outbound) return;

  events.emit({
    type: EventTypes.MESSAGE_SENT,
    conversationId: ctx.conversation.id,
    messageId: ctx.outbound.id,
    content: ctx.outbound.content,
    senderType: 'ai',
    channel: ctx.inbound.channel as ChannelType,
    timestamp: new Date(),
  });
};
