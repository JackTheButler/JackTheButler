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

describe('assistant profile', () => {
  it('requires auth (protected-by-default)', async () => {
    expect((await app.request('/api/app/assistant')).status).toBe(401);
  });

  it('lazy-seeds defaults on first GET', async () => {
    const body = await (await authed('/api/app/assistant')).json();
    expect(body).toMatchObject({
      name: 'Jane',
      tone: 'Friendly',
      responseLength: 'standard',
      fallback: expect.any(String),
      instructions: expect.any(String),
      topicsToAvoid: '',
    });
    // The seeded row should now exist — repeat GETs are idempotent.
    expect(await (await authed('/api/app/assistant')).json()).toEqual(body);
  });

  it('rejects invalid tone', async () => {
    const res = await authed('/api/app/assistant', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Ada',
        tone: 'Sassy',
        instructions: '',
        fallback: 'hi',
        topicsToAvoid: '',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('persists a save and returns the new row', async () => {
    const next = {
      name: 'Ada',
      tone: 'Professional' as const,
      instructions: 'Be concise.',
      fallback: 'Let me get a teammate.',
      topicsToAvoid: 'legal',
    };
    const res = await authed('/api/app/assistant', {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject(next);
    // Round-trip via GET to confirm it landed in storage.
    expect(await (await authed('/api/app/assistant')).json()).toMatchObject(next);
  });

  it('patches only the provided fields, leaving the rest unchanged', async () => {
    // Prior test left name 'Ada', tone 'Professional'. Send just one field.
    const res = await authed('/api/app/assistant', {
      method: 'PUT',
      body: JSON.stringify({ responseLength: 'brief' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: 'Ada', // untouched
      tone: 'Professional', // untouched
      responseLength: 'brief', // updated
      fallback: 'Let me get a teammate.', // untouched
      topicsToAvoid: 'legal', // untouched
    });
  });
});
