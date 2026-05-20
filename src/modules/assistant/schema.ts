import { z } from 'zod';

/** Request validation. Single-row PUT — body is the full profile. */

export const TONES = ['Friendly', 'Professional', 'Concise'] as const;

export const assistantBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Assistant name is required.')
    .max(80, 'Assistant name is too long (max 80 characters).'),
  tone: z.enum(TONES, { message: 'Please pick a tone.' }),
  instructions: z
    .string()
    .max(4000, 'Instructions are too long (max 4000 characters).')
    .default(''),
  fallback: z
    .string()
    .trim()
    .min(1, 'Fallback message is required.')
    .max(1000, 'Fallback message is too long (max 1000 characters).'),
  topicsToAvoid: z
    .string()
    .max(2000, 'Topics-to-avoid is too long (max 2000 characters).')
    .default(''),
});
