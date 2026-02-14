/**
 * Webchat i18n — Server-side translation helpers
 *
 * All translations live in JSON files next to this module.
 * The widget receives UI strings via the config endpoint;
 * server-side messages (action responses, errors) use t().
 */

import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import ar from './ar.json' with { type: 'json' };
import hi from './hi.json' with { type: 'json' };
import ru from './ru.json' with { type: 'json' };
import zh from './zh.json' with { type: 'json' };

// ============================================
// Types
// ============================================

export const SUPPORTED_LOCALES = ['en', 'es', 'ar', 'hi', 'ru', 'zh'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

type TranslationData = typeof en;

/** Flat widget strings sent to the client via config endpoint */
export type WidgetStrings = TranslationData['widget'];

// ============================================
// Locale map
// ============================================

const locales: Record<SupportedLocale, TranslationData> = { en, es, ar, hi, ru, zh };

// ============================================
// Public API
// ============================================

/**
 * Resolve a browser locale string (e.g. 'es-MX') to a supported locale.
 * Falls back to 'en' for unknown locales.
 */
export function resolveLocale(locale?: string): SupportedLocale {
  if (!locale) return 'en';

  // Exact match first
  const lower = locale.toLowerCase();
  if (isSupportedLocale(lower)) return lower;

  // Try language prefix (e.g. 'es-MX' → 'es')
  const prefix = lower.split('-')[0]!;
  if (isSupportedLocale(prefix)) return prefix;

  return 'en';
}

/**
 * Translate a dot-notation key with optional parameter interpolation.
 *
 * @example t('es', 'messages.verifiedWelcome', { firstName: 'Maria' })
 */
export function t(locale: SupportedLocale, key: string, params?: Record<string, string>): string {
  const value = lookup(locales[locale], key) ?? lookup(locales.en, key) ?? key;
  return params ? interpolate(value, params) : value;
}

/**
 * Get the flat widget strings object for the config endpoint.
 */
export function getWidgetStrings(locale: SupportedLocale): WidgetStrings {
  return locales[locale]?.widget ?? locales.en.widget;
}

// ============================================
// Helpers
// ============================================

function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Dot-notation lookup into a nested object.
 * e.g. lookup(obj, 'messages.verifiedWelcome') → obj.messages.verifiedWelcome
 */
function lookup(obj: unknown, path: string): string | undefined {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Replace {{param}} placeholders in a template string.
 */
function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? `{{${key}}}`);
}
