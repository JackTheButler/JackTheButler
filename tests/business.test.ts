import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');

const COOKIE = 'jane_session';
let cookie = '';

function authed(path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE}=${cookie}`,
      ...(init.headers ?? {}),
    },
  });
}

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  cookie = res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];
});

describe('business profile', () => {
  it('requires auth (protected-by-default)', async () => {
    expect((await app.request('/api/app/business')).status).toBe(401);
  });

  it('seeds only defaultLanguage on first GET; name + email start empty', async () => {
    const body = await (await authed('/api/app/business')).json();
    expect(body).toEqual({
      name: '',
      supportEmail: null,
      defaultLanguage: 'en',
    });
    // Idempotent: second GET returns the same persisted shape.
    expect(await (await authed('/api/app/business')).json()).toEqual(body);
  });

  it('rejects an empty name', async () => {
    const res = await authed('/api/app/business', {
      method: 'PUT',
      body: JSON.stringify({ name: '', defaultLanguage: 'en' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed BCP-47 code', async () => {
    const res = await authed('/api/app/business', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Acme', defaultLanguage: 'English!' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed support email', async () => {
    const res = await authed('/api/app/business', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Acme', supportEmail: 'not-an-email', defaultLanguage: 'en' }),
    });
    expect(res.status).toBe(400);
  });

  it('normalises an empty supportEmail to null', async () => {
    const res = await authed('/api/app/business', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Acme', supportEmail: '', defaultLanguage: 'en' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).supportEmail).toBeNull();
  });

  it('persists a save and round-trips via GET', async () => {
    const next = {
      name: 'Acme Co.',
      supportEmail: 'help@acme.co',
      defaultLanguage: 'fa',
    };
    const res = await authed('/api/app/business', {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(next);
    expect(await (await authed('/api/app/business')).json()).toEqual(next);
  });
});
