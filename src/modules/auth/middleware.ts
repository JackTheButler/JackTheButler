import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from '@/config.js';
import { verifySession, signSession } from '@/modules/auth/jwt.js';
import { setSessionCookie, clearSessionCookie } from '@/modules/auth/cookie.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** Hono env: `c.get('user')` is available on protected routes. */
export type AuthEnv = { Variables: { user: AuthUser } };

/**
 * Require a valid session. Rolling renewal: if the token is older than
 * `sessionRenewAfterMs`, a fresh cookie is issued so active users never
 * have to re-login.
 */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getCookie(c, config.cookieName);
  if (!token) return unauthorized(c);

  const session = await verifySession(token);
  if (!session) {
    clearSessionCookie(c);
    return unauthorized(c);
  }

  const user: AuthUser = { id: session.sub, email: session.email, name: session.name };
  c.set('user', user);

  if (Date.now() - session.issuedAtMs > config.sessionRenewAfterMs) {
    const fresh = await signSession({ sub: user.id, email: user.email, name: user.name });
    setSessionCookie(c, fresh);
  }

  await next();
};

function unauthorized(c: Context) {
  return c.json({ error: 'unauthorized' }, 401);
}
