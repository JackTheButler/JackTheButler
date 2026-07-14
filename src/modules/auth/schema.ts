import { z } from 'zod';

/** Request validation schemas for the auth module. */

export const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const setupBody = credentials.extend({
  name: z.string().trim().min(1),
});

export type Credentials = z.infer<typeof credentials>;
export type SetupBody = z.infer<typeof setupBody>;
