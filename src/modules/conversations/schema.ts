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
  /** Whether to translate the reply into the customer's language before
   *  delivery. Defaults to true; the agent can opt out per reply. */
  translate: z.boolean().optional().default(true),
});

export const statusQuery = z.enum(['open', 'closed']).optional();
