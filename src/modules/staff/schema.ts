import { z } from 'zod';

export const ROLES = ['admin', 'agent'] as const;

export const inviteBody = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required.'),
  role: z.enum(ROLES),
});

export const roleBody = z.object({ role: z.enum(ROLES) });

export const acceptInviteBody = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required.').max(80),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
});
