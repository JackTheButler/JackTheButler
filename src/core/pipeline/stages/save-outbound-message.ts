import { conversationService } from '@/services/conversation.js';
import { events, EventTypes } from '@/events/index.js';
import type { MessageContext } from '../context.js';

export async function saveOutboundMessage(ctx: MessageContext): Promise<void> {
  if (!ctx.aiResponse || !ctx.conversation) return;

  const saved = await conversationService.addMessage(ctx.conversation.id, {
    direction: 'outbound',
    senderType: 'ai',
    content: ctx.aiResponse.content,
    translatedContent: ctx.translatedResponse,
    contentType: 'text',
    intent: ctx.aiResponse.intent,
    confidence: ctx.aiResponse.confidence,
    entities: ctx.aiResponse.entities,
  });

  ctx.savedOutboundId = saved.id;

  const deliveredContent = ctx.translatedResponse ?? ctx.aiResponse.content;

  events.emit({
    type: EventTypes.MESSAGE_SENT,
    conversationId: ctx.conversation.id,
    messageId: saved.id,
    content: deliveredContent,
    senderType: 'ai',
    channel: ctx.inbound.channel,
    timestamp: new Date(),
  });

  ctx.outbound = {
    conversationId: ctx.conversation.id,
    content: deliveredContent,
    contentType: 'text',
    ...(ctx.aiResponse.metadata && { metadata: ctx.aiResponse.metadata }),
  };
}
