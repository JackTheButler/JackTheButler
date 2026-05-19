import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';

// Isolated in-memory DB + deterministic secret before importing the app.
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');

const COOKIE = 'jane_session';
const ADMIN = { email: 'admin@example.com', password: 'supersecret', name: 'Admin' };

function readSessionCookie(res: Response): string | null {
  const raw = res.headers.get('set-cookie');
  const m = raw?.match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

function jsonReq(path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

let adminId = '';

describe('auth — first-install setup', () => {
  it('reports needsSetup before any staff exist', async () => {
    const res = await app.request('/api/auth/setup-status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ needsSetup: true });
  });

  it('creates the first admin and sets a session cookie', async () => {
    const res = await jsonReq('/api/auth/setup', ADMIN);
    expect(res.status).toBe(201);
    expect(readSessionCookie(res)).toBeTruthy();
    const body = await res.json();
    expect(body.user.email).toBe(ADMIN.email);
    adminId = body.user.id;
  });

  it('reports needsSetup false afterwards and rejects a second setup', async () => {
    expect(await (await app.request('/api/auth/setup-status')).json()).toEqual({
      needsSetup: false,
    });
    const res = await jsonReq('/api/auth/setup', ADMIN);
    expect(res.status).toBe(409);
  });
});

describe('auth — login', () => {
  it('rejects invalid input with 400', async () => {
    const res = await jsonReq('/api/auth/login', { email: 'nope', password: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects wrong credentials with 401', async () => {
    const res = await jsonReq('/api/auth/login', {
      email: ADMIN.email,
      password: 'wrongpass',
    });
    expect(res.status).toBe(401);
  });

  it('accepts correct credentials and sets a cookie', async () => {
    const res = await jsonReq('/api/auth/login', {
      email: ADMIN.email,
      password: ADMIN.password,
    });
    expect(res.status).toBe(200);
    expect(readSessionCookie(res)).toBeTruthy();
  });
});

describe('auth — protected routes', () => {
  let cookie = '';

  beforeAll(async () => {
    const res = await jsonReq('/api/auth/login', {
      email: ADMIN.email,
      password: ADMIN.password,
    });
    cookie = readSessionCookie(res)!;
  });

  it('rejects the protected route without a cookie', async () => {
    const res = await app.request('/api/app/ping');
    expect(res.status).toBe(401);
  });

  it('allows the protected route with a valid cookie', async () => {
    const res = await app.request('/api/app/ping', {
      headers: { cookie: `${COOKIE}=${cookie}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('pong');
    expect(body.user.email).toBe(ADMIN.email);
  });

  it('/me returns the current user', async () => {
    const res = await app.request('/api/auth/me', {
      headers: { cookie: `${COOKIE}=${cookie}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe(ADMIN.email);
  });

  it('a fresh token is NOT re-issued (no rolling renewal yet)', async () => {
    const res = await app.request('/api/app/ping', {
      headers: { cookie: `${COOKIE}=${cookie}` },
    });
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('auth — rolling session', () => {
  it('re-issues the cookie when the token is older than the renew window', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const nowSec = Math.floor(Date.now() / 1000);
    const oldToken = await new SignJWT({ email: ADMIN.email, name: ADMIN.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(adminId)
      .setIssuedAt(nowSec - 2 * 24 * 60 * 60) // 2 days old
      .setExpirationTime(nowSec + 60 * 60)
      .sign(secret);

    const res = await app.request('/api/app/ping', {
      headers: { cookie: `${COOKIE}=${oldToken}` },
    });
    expect(res.status).toBe(200);
    expect(readSessionCookie(res)).toBeTruthy();
  });
});

describe('auth — logout', () => {
  it('clears the session cookie', async () => {
    const res = await app.request('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain(`${COOKIE}=`);
  });
});
