import { z } from 'zod';

/** Zod for POST/PUT bodies. Status is server-managed for the manual flow
 *  (always 'approved'); the AI-extraction flow later writes 'draft' rows
 *  directly via its own internal path. */

export const entryBody = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Question is required.')
    .max(1000, 'Question is too long (max 1000 characters).'),
  answer: z
    .string()
    .trim()
    .min(1, 'Answer is required.')
    .max(8000, 'Answer is too long (max 8000 characters).'),
  topic: z
    .union([z.literal(''), z.string().trim().min(1).max(80)])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
});
