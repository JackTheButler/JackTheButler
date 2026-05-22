import { z } from 'zod';

/** Update your own display name. */
export const nameBody = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name is too long (max 80).'),
});

/** Change your own password — current verified before the new one is set. */
export const passwordBody = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(200),
});
