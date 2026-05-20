import { z } from 'zod';

/** Request validation. Single-row PUT — body is the full profile. */

export const TONES = ['Friendly', 'Professional', 'Concise'] as const;

export const assistantBody = z.object({
  name: z.string().trim().min(1).max(80),
  tone: z.enum(TONES),
  instructions: z.string().max(4000).default(''),
  fallback: z.string().trim().min(1).max(1000),
  topicsToAvoid: z.string().max(2000).default(''),
});
