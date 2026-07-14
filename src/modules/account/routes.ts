import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import type { AuthEnv } from '@/modules/auth/middleware.js';
import { nameBody, passwordBody } from '@/modules/account/schema.js';
import { changePassword, updateName } from '@/modules/account/service.js';

/** Self-service account routes — act on the current session's own user
 *  (all staff; not admin-gated). */
export const accountRoutes = new Hono<AuthEnv>();

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

accountRoutes.put('/', async (c) => {
  const parsed = nameBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(updateName(c.get('user').id, parsed.data.name));
});

accountRoutes.post('/password', async (c) => {
  const parsed = passwordBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  await changePassword(c.get('user').id, parsed.data.currentPassword, parsed.data.newPassword);
  return c.json({ ok: true });
});
