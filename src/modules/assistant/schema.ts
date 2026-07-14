import { z } from 'zod';

/**
 * Request validation for the single-row PUT. Every field is optional so a
 * caller can patch just the fields it owns (e.g. the Persona vs Boundaries
 * tab) — the service merges the provided fields over the stored row and
 * leaves the rest unchanged. Present fields are still fully validated.
 */

export const TONES = ['Friendly', 'Professional', 'Casual'] as const;
export const RESPONSE_LENGTHS = ['brief', 'standard', 'detailed'] as const;

export const assistantBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Assistant name is required.')
      .max(80, 'Assistant name is too long (max 80 characters).'),
    tone: z.enum(TONES, { message: 'Please pick a tone.' }),
    responseLength: z.enum(RESPONSE_LENGTHS, { message: 'Please pick a response length.' }),
    instructions: z.string().max(4000, 'Instructions are too long (max 4000 characters).'),
    fallback: z
      .string()
      .trim()
      .min(1, 'Fallback message is required.')
      .max(1000, 'Fallback message is too long (max 1000 characters).'),
    topicsToAvoid: z.string().max(2000, 'Topics-to-avoid is too long (max 2000 characters).'),
  })
  .partial();
