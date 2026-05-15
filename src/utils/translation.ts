/**
 * Translation utilities — property language settings + outbound staff-reply
 * translation. The pipeline runs language detection and translation as
 * stages inside `@jackthebutler/pipeline`; the only external consumer of
 * `translate()` is the staff-reply endpoint at
 * `gateway/routes/conversations.ts` which translates staff messages into
 * the guest's language before sending.
 *
 * @module utils/translation
 */

import { getAppRegistry } from '@/apps/index.js';
import { settingsService } from '@/services/settings.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('translation');

/**
 * Get the property's operating language from settings.
 * Defaults to 'en' if not configured.
 */
export async function getPropertyLanguage(): Promise<string> {
  return settingsService.get<string>('property_language', 'en');
}

/**
 * Translate text to a target language.
 */
export async function translate(
  text: string,
  targetLanguage: string,
  sourceLanguage: string,
): Promise<string> {
  const provider = getAppRegistry().getActiveAIProvider();
  if (!provider) {
    log.warn('No active AI provider, returning original text');
    return text;
  }

  const response = await provider.complete({
    messages: [
      {
        role: 'user',
        content: `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Return only the translation, no explanations.

Text: "${text}"`,
      },
    ],
    maxTokens: 2048,
    temperature: 0.1,
    modelTier: 'utility',
    purpose: 'translation',
  });

  return response.content.trim();
}
