import { guestContextService } from '@/core/conversation/guest-context.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function loadGuestContext(ctx: MessageContext): Promise<void> {
  if (!ctx.conversation) return;

  if (ctx.inbound.channel === 'whatsapp' || ctx.inbound.channel === 'sms') {
    try {
      await guestContextService.matchConversation(ctx.conversation.id, { phone: ctx.inbound.channelId });
    } catch (err) {
      log.warn({ err, conversationId: ctx.conversation.id }, 'Failed to match guest by phone');
    }
  }

  if (!ctx.conversation.guestId) return;

  try {
    ctx.guestContext = await guestContextService.getContextByConversation(ctx.conversation.id);
    if (ctx.guestContext.guest) {
      log.debug(
        {
          conversationId: ctx.conversation.id,
          guestName: ctx.guestContext.guest.fullName,
          hasReservation: !!ctx.guestContext.reservation,
          roomNumber: ctx.guestContext.reservation?.roomNumber,
        },
        'Guest context loaded'
      );
    }
  } catch (err) {
    log.warn({ err, conversationId: ctx.conversation.id }, 'Failed to load guest context');
  }
}
