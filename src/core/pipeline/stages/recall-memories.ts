import { memoryService } from '@/services/memory.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function recallMemories(ctx: MessageContext): Promise<void> {
  // guestContext is populated for all channels by loadGuestContext.
  // ctx.guest is only set for WhatsApp/SMS by identifyGuest — do not use it here.
  const guestId = ctx.guestContext?.guest?.id;
  if (!guestId) return;

  try {
    ctx.memories = await memoryService.recall(guestId, ctx.queryEmbedding);

    if (ctx.memories.length > 0) {
      log.debug(
        { guestId, count: ctx.memories.length, hasEmbedding: !!ctx.queryEmbedding },
        'Guest memories recalled',
      );
    }
  } catch (err) {
    log.warn({ err, guestId }, 'Failed to recall guest memories — continuing without');
  }
}
