import { conversationService } from '@/services/conversation.js';
import { getPropertyLanguage } from '@/utils/translation.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function resolveConversation(ctx: MessageContext): Promise<void> {
  ctx.conversation = await conversationService.findOrCreate(
    ctx.inbound.channel,
    ctx.inbound.channelId,
    ctx.guest?.id
  );
  ctx.propertyLanguage = await getPropertyLanguage();
  log.debug(
    { conversationId: ctx.conversation.id, guestId: ctx.conversation.guestId },
    'Conversation resolved'
  );
}
