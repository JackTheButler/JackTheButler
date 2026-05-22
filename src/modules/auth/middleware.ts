import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from '@/config.js';
import { verifySession, signSession } from '@/modules/auth/jwt.js';
import { setSessionCookie, clearSessionCookie } from '@/modules/auth/cookie.js';
import { loadSessionUser, type StaffRole } from '@/modules/auth/service.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
}

/** Hono env: `c.get('user')` is available on protected routes. */
export type AuthEnv = { Variables: { user: AuthUser } };

/**
 * Require a valid session. The user is re-read from the DB each request so
 * role changes apply immediately and a `disabled` account loses access at
 * once. Rolling renewal: a token older than `sessionRenewAfterMs` gets a
 * fresh cookie so active users never have to re-login.
 */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getCookie(c, config.cookieName);
  if (!token) return unauthorized(c);

  const session = await verifySession(token);
  if (!session) {
    clearSessionCookie(c);
    return unauthorized(c);
  }

  const user = loadSessionUser(session.sub);
  if (!user) {
    // Account deleted or disabled since the token was issued.
    clearSessionCookie(c);
    return unauthorized(c);
  }
  c.set('user', user);

  if (Date.now() - session.issuedAtMs > config.sessionRenewAfterMs) {
    const fresh = await signSession({ sub: user.id, email: user.email, name: user.name });
    setSessionCookie(c, fresh);
  }

  await next();
};

/** Admin-only gate. Mount after `requireAuth` so `user` is set. */
export const requireAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (c.get('user')?.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  await next();
};

function unauthorized(c: Context) {
  return c.json({ error: 'unauthorized' }, 401);
}
