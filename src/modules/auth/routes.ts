import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import { signSession } from '@/modules/auth/jwt.js';
import { setSessionCookie, clearSessionCookie } from '@/modules/auth/cookie.js';
import { requireAuth, type AuthEnv } from '@/modules/auth/middleware.js';
import { credentials, setupBody } from '@/modules/auth/schema.js';
import { authenticate, createInitialAdmin, needsSetup } from '@/modules/auth/service.js';

/** Thin HTTP adapter: validate → call service → set cookie → serialize.
 *  No business logic here; no error formatting (see core/http.ts). */
export const authRoutes = new Hono<AuthEnv>();

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

authRoutes.get('/setup-status', (c) => c.json({ needsSetup: needsSetup() }));

authRoutes.post('/setup', async (c) => {
  const parsed = setupBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);

  const user = await createInitialAdmin(parsed.data);
  setSessionCookie(c, await signSession({ sub: user.id, email: user.email, name: user.name }));
  return c.json({ user }, 201);
});

authRoutes.post('/login', async (c) => {
  const parsed = credentials.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);

  const user = await authenticate(parsed.data.email, parsed.data.password);
  setSessionCookie(c, await signSession({ sub: user.id, email: user.email, name: user.name }));
  return c.json({ user });
});

authRoutes.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, (c) => c.json({ user: c.get('user') }));
