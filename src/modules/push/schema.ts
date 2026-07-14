import { z } from 'zod';

export const subscribeBody = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  userAgent: z.string().optional(),
});

export const unsubscribeBody = z.object({
  endpoint: z.string().url(),
});
