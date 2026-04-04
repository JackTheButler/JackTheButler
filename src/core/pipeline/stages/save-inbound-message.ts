import { conversationService } from '@/services/conversation.js';
import { events, EventTypes } from '@/events/index.js';
import type { MessageContext } from '../context.js';

export async function saveInboundMessage(ctx: MessageContext): Promise<void> {
  if (!ctx.conversation) return;

  const saved = await conversationService.addMessage(ctx.conversation.id, {
    direction: 'inbound',
    senderType: 'guest',
    content: ctx.inbound.content,
    contentType: ctx.inbound.contentType,
    detectedLanguage: ctx.detectedLanguage,
    translatedContent: ctx.translatedContent,
  });

  ctx.savedInboundId = saved.id;

  events.emit({
    type: EventTypes.MESSAGE_RECEIVED,
    conversationId: ctx.conversation.id,
    messageId: saved.id,
    channel: ctx.inbound.channel,
    content: ctx.inbound.content,
    contentType: ctx.inbound.contentType,
    timestamp: new Date(),
  });
}
