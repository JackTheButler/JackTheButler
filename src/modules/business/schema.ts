import { z } from 'zod';

/** Request validation. Single-row PUT — body is the full profile. */

/** Languages exposed in the dashboard's dropdown. The DB column accepts
 *  any string, so a future "Other (BCP-47)" custom-input affordance can
 *  be added in the UI without a schema change — it'll round-trip fine. */
export const LANGUAGES = ['en', 'fa', 'ar', 'es', 'de', 'fr'] as const;

export const businessBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Business name is required.')
    .max(120, 'Business name is too long (max 120 characters).'),
  /** Optional. Empty string is normalised to null so storage stays clean. */
  supportEmail: z
    .union([
      z.literal(''),
      z.string().trim().email('Support email is not a valid address.'),
    ])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
  /** BCP-47 code. Loosely validated (`xx` or `xx-XX`) so we don't have to
   *  enumerate every language the operator might one day want. */
  defaultLanguage: z
    .string()
    .trim()
    .min(2, 'Please choose a default language.')
    .max(10, 'Language code is too long.')
    .regex(
      /^[a-z]{2,3}(-[A-Z]{2})?$/,
      'Language must be a BCP-47 code like "en" or "fa".',
    ),
});
