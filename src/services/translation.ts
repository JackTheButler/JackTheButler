/**
 * Translation Service
 *
 * Language detection and translation using the configured AI provider.
 * Uses getAppRegistry().getActiveAIProvider() for LLM calls.
 *
 * @module services/translation
 */

import { getAppRegistry } from '@/apps/index.js';
import { settingsService } from './settings.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('translation');

// ===================
// Types
// ===================

export interface DetectAndTranslateResult {
  detectedLanguage: string;
  translatedContent: string | null;
}

// ===================
// Property Language
// ===================

/**
 * Get the property's operating language from settings.
 * Defaults to 'en' if not configured.
 */
export async function getPropertyLanguage(): Promise<string> {
  return settingsService.get<string>('property_language', 'en');
}

// ===================
// Detection + Translation
// ===================

/**
 * Detect language and optionally translate in a single LLM call.
 * Returns the detected language code and translation (null if already in target language).
 */
export async function detectAndTranslate(
  text: string,
  targetLanguage: string
): Promise<DetectAndTranslateResult> {
  const provider = getAppRegistry().getActiveAIProvider();
  if (!provider) {
    log.warn('No active AI provider, skipping translation');
    return { detectedLanguage: targetLanguage, translatedContent: null };
  }

  const response = await provider.complete({
    messages: [
      {
        role: 'user',
        content: `Detect the language of the following text. If it is not in ${targetLanguage}, also translate it.
Respond in JSON only: { "language": "xx", "translation": "..." }
If the text is already in ${targetLanguage}, respond: { "language": "${targetLanguage}", "translation": null }

Text: "${text}"`,
      },
    ],
    maxTokens: 2048,
    temperature: 0.1,
    modelTier: 'utility',
    purpose: 'language_detection',
    onComplete: (content) => {
      const p = parseJsonResponse(content);
      return {
        detectedLanguage: p?.language ?? null,
        translated: !!p?.translation,
      };
    },
  });

  const parsed = parseJsonResponse(response.content);
  if (!parsed || !parsed.language) {
    log.warn({ response: response.content }, 'Failed to parse detection response');
    throw new Error('Failed to parse language detection response');
  }

  return {
    detectedLanguage: parsed.language,
    translatedContent: parsed.translation ?? null,
  };
}

// ===================
// Translation
// ===================

/**
 * Translate text to a target language.
 */
export async function translate(
  text: string,
  targetLanguage: string,
  sourceLanguage: string
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

// ===================
// Helpers
// ===================

function parseJsonResponse(content: string): { language?: string; translation?: string | null } | null {
  try {
    // Strip markdown code fences if present
    const cleaned = content.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from within surrounding text
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch { /* fall through */ }
    }
    return null;
  }
}
