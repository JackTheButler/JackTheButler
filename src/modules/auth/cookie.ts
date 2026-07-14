import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { config } from '@/config.js';

/** Write the session JWT as an httpOnly, SameSite=Lax cookie. */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, config.cookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.isProduction,
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, config.cookieName, { path: '/' });
}
