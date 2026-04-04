import { guestService } from '@/services/guest.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function identifyGuest(ctx: MessageContext): Promise<void> {
  if (ctx.inbound.channel !== 'whatsapp' && ctx.inbound.channel !== 'sms') return;
  try {
    ctx.guest = await guestService.findOrCreateByPhone(ctx.inbound.channelId);
    log.debug({ guestId: ctx.guest.id, phone: ctx.inbound.channelId }, 'Guest identified by phone');
  } catch (err) {
    log.warn({ err, phone: ctx.inbound.channelId }, 'Failed to identify guest by phone');
  }
}
