import { z } from 'zod';

/** Request validation for the conversations module. */

export const ingestBody = z.object({
  channel: z.string().min(1),
  externalId: z.string().min(1),
  content: z.string().min(1),
  name: z.string().optional(),
  contact: z.string().optional(),
});

export const replyBody = z.object({
  content: z.string().min(1),
});

export const statusQuery = z.enum(['open', 'closed']).optional();
