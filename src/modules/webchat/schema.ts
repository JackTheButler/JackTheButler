import { z } from 'zod';

/** Public widget request validation. */
export const widgetMessageBody = z.object({
  visitorId: z.string().min(1),
  content: z.string().min(1),
});
