import { conversationService } from '@/services/conversation.js';
import { detectAndTranslate } from '@/services/translation.js';
import { createLogger } from '@/utils/logger.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function detectLanguage(ctx: MessageContext): Promise<void> {
  if (!ctx.conversation) return;
  try {
    const result = await detectAndTranslate(ctx.inbound.content, ctx.propertyLanguage ?? 'en');
    ctx.detectedLanguage = result.detectedLanguage;
    if (result.translatedContent) ctx.translatedContent = result.translatedContent;

    await conversationService.update(ctx.conversation.id, { guestLanguage: ctx.detectedLanguage });

    // Pass to responder via metadata — read by AIResponder.generate() in Stage 2
    ctx.inbound.metadata = {
      ...ctx.inbound.metadata,
      detectedLanguage: ctx.detectedLanguage,
      translatedContent: ctx.translatedContent,
    };
  } catch (err) {
    log.warn({ err }, 'Language detection failed, continuing without translation');
  }
}
