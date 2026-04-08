import { conversationService } from '@/services/conversation.js';
import { guestContextService } from '@/core/conversation/guest-context.js';
import { guestService, normalizePhone } from '@/services/guest.js';
import { getPropertyLanguage } from '@/utils/translation.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function resolveConversation(ctx: MessageContext): Promise<void> {
  // For channels with automatic identification, look up guest before creating
  // the conversation so it is linked from the start — no UPDATE needed afterwards.
  let guestId: string | undefined;
  if (ctx.inbound.channel === 'whatsapp' || ctx.inbound.channel === 'sms') {
    const normalized = normalizePhone(ctx.inbound.channelId);
    if (normalized) {
      try {
        const guest = await guestService.findOrCreateByPhone(normalized);
        guestId = guest.id;
      } catch (err) {
        log.warn({ err, phone: ctx.inbound.channelId }, 'Failed to identify guest by phone');
      }
    }
  }

  ctx.conversation = await conversationService.findOrCreate(
    ctx.inbound.channel,
    ctx.inbound.channelId,
    guestId
  );
  ctx.propertyLanguage = await getPropertyLanguage();

  log.debug(
    { conversationId: ctx.conversation.id, guestId: ctx.conversation.guestId },
    'Conversation resolved'
  );

  // Load full guest profile if the conversation is linked to a guest
  if (!ctx.conversation.guestId) return;
  try {
    ctx.guestContext = await guestContextService.getContextByConversation(ctx.conversation.id);
    if (ctx.guestContext.guest) {
      log.debug(
        {
          conversationId: ctx.conversation.id,
          guestName: ctx.guestContext.guest.fullName,
          hasReservation: !!ctx.guestContext.reservation,
        },
        'Guest context loaded'
      );
    }
  } catch (err) {
    log.warn({ err, conversationId: ctx.conversation.id }, 'Failed to load guest context');
  }
}
