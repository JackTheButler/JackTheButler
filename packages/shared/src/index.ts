import { z } from 'zod';

/** Shared types/schemas used by API + dashboard. */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  service: z.string(),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;

export * from './manifest.js';
export * from './dto.js';
