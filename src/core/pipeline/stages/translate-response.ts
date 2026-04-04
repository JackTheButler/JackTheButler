import { translate } from '@/services/translation.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function translateResponse(ctx: MessageContext): Promise<void> {
  if (!ctx.aiResponse || !ctx.conversation) return;

  const guestLang = ctx.detectedLanguage ?? ctx.conversation.guestLanguage ?? 'en';
  if (guestLang === ctx.propertyLanguage) return;

  try {
    ctx.translatedResponse = await translate(
      ctx.aiResponse.content,
      guestLang,
      ctx.propertyLanguage ?? 'en'
    );
  } catch (err) {
    log.warn({ err }, 'Outbound translation failed');
  }
}
