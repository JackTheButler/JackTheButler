import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';

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

const ingest = (b: unknown) =>
  authed('/api/app/conversations/ingest', { method: 'POST', body: JSON.stringify(b) });
const post = (p: string) => authed(p, { method: 'POST' });

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  cookie = res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];
});

describe('conversations — auth', () => {
  it('401 without a session', async () => {
    expect((await app.request('/api/app/conversations')).status).toBe(401);
  });
});

describe('conversations — anonymous webchat (no customer)', () => {
  it('ingest creates a conversation with no customer', async () => {
    const r = await ingest({ channel: 'webchat', externalId: 'vid1', content: 'hello' });
    expect(r.status).toBe(201);

    const { conversations } = await (await authed('/api/app/conversations')).json();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      channel: 'webchat',
      mode: 'ai',
      status: 'open',
      customerName: null,
      snippet: 'hello',
      needsReply: true,
      ref: 1,
    });

    const detail = await (
      await authed(`/api/app/conversations/${conversations[0].id}`)
    ).json();
    expect(detail.customer).toBeNull();
  });

  it('re-ingest same visitor reuses the open conversation', async () => {
    await ingest({ channel: 'webchat', externalId: 'vid1', content: 'again' });
    const { conversations } = await (await authed('/api/app/conversations')).json();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].snippet).toBe('again');
  });

  it('a different visitor gets a new conversation with an incremented ref', async () => {
    await ingest({ channel: 'webchat', externalId: 'vid2', content: 'hi' });
    const { conversations } = await (await authed('/api/app/conversations')).json();
    expect(conversations).toHaveLength(2);
    expect(new Set(conversations.map((c: { ref: number }) => c.ref))).toEqual(new Set([1, 2]));
  });

  it('messages carry language + translation fields (null until pipeline detects)', async () => {
    const { conversations } = await (await authed('/api/app/conversations')).json();
    const id = conversations[0].id;
    const detail = await (await authed(`/api/app/conversations/${id}`)).json();
    const msg = detail.messages.find((m: { author: string }) => m.author === 'customer');
    expect(msg).toMatchObject({
      author: 'customer',
      content: expect.any(String),
      // Phase 2a: shape is present, populated as null until detect runs.
      language: null,
      translation: null,
    });
  });
});

describe('conversations — strong channel resolves a customer', () => {
  it('telegram ingest creates + reuses one customer', async () => {
    await ingest({ channel: 'telegram', externalId: 'tg99', content: 'yo', name: 'Bob' });
    const list = await (await authed('/api/app/conversations?status=open')).json();
    const tg = list.conversations.find((c: { channel: string }) => c.channel === 'telegram');
    expect(tg.customerName).toBe('Bob');

    const d1 = await (await authed(`/api/app/conversations/${tg.id}`)).json();
    await ingest({ channel: 'telegram', externalId: 'tg99', content: 'still me' });
    const d2 = await (await authed(`/api/app/conversations/${tg.id}`)).json();
    expect(d2.customer.id).toBe(d1.customer.id); // same customer, not duplicated
  });
});

describe('conversations — continuous (reopen on inbound)', () => {
  it('a closed conversation reopens on next inbound: same row, mode reset, marker', async () => {
    await ingest({ channel: 'webchat', externalId: 'cont1', content: 'first' });
    const before = (await (await authed('/api/app/conversations')).json()).conversations;
    const conv = before.find((c: { snippet: string }) => c.snippet === 'first');

    await post(`/api/app/conversations/${conv.id}/close`);
    await ingest({ channel: 'webchat', externalId: 'cont1', content: 'back again' });

    const detail = await (await authed(`/api/app/conversations/${conv.id}`)).json();
    expect(detail.status).toBe('open'); // reopened
    expect(detail.mode).toBe('ai'); // takeover reset on reopen
    expect(
      detail.messages.some((m: { event: string | null }) => m.event === 'reopened'),
    ).toBe(true);

    const list = (await (await authed('/api/app/conversations')).json()).conversations;
    expect(list.filter((c: { id: string }) => c.id === conv.id)).toHaveLength(1); // no new row
    expect(list.find((c: { id: string }) => c.id === conv.id).snippet).toBe('back again'); // ignores marker
  });
});

describe('conversations — takeover state machine', () => {
  let id = '';
  beforeAll(async () => {
    await ingest({ channel: 'webchat', externalId: 'sm1', content: 'need help' });
    const { conversations } = await (
      await authed('/api/app/conversations?status=open')
    ).json();
    id = conversations.find((c: { snippet: string }) => c.snippet === 'need help').id;
  });

  it('reply is blocked until takeover (strict)', async () => {
    expect(
      (
        await authed(`/api/app/conversations/${id}/reply`, {
          method: 'POST',
          body: JSON.stringify({ content: 'hi' }),
        })
      ).status,
    ).toBe(409);
  });

  it('takeover → human, then agent can reply', async () => {
    const t = await (await post(`/api/app/conversations/${id}/takeover`)).json();
    expect(t.mode).toBe('human');
    const r = await authed(`/api/app/conversations/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'on it' }),
    });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.messages.some((m: { author: string }) => m.author === 'agent')).toBe(true);
  });

  it('takeover again is an invalid transition (409)', async () => {
    expect((await post(`/api/app/conversations/${id}/takeover`)).status).toBe(409);
  });

  it('handback → ai, reply blocked again', async () => {
    const h = await (await post(`/api/app/conversations/${id}/handback`)).json();
    expect(h.mode).toBe('ai');
    expect(
      (
        await authed(`/api/app/conversations/${id}/reply`, {
          method: 'POST',
          body: JSON.stringify({ content: 'x' }),
        })
      ).status,
    ).toBe(409);
  });

  it('handback when already ai is invalid (409)', async () => {
    expect((await post(`/api/app/conversations/${id}/handback`)).status).toBe(409);
  });

  it('close blocks reply, reopen restores', async () => {
    expect((await (await post(`/api/app/conversations/${id}/close`)).json()).status).toBe(
      'closed',
    );
    await post(`/api/app/conversations/${id}/takeover`).catch(() => {});
    const r = await authed(`/api/app/conversations/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'x' }),
    });
    expect(r.status).toBe(409); // conversation_closed
    expect((await (await post(`/api/app/conversations/${id}/reopen`)).json()).status).toBe(
      'open',
    );
  });
});

describe('conversations — misc', () => {
  it('404 for unknown conversation', async () => {
    expect((await authed('/api/app/conversations/nope')).status).toBe(404);
  });

  it('400 for invalid status filter', async () => {
    expect((await authed('/api/app/conversations?status=weird')).status).toBe(400);
  });

  it('400 for invalid ingest body', async () => {
    expect((await ingest({ channel: 'webchat' })).status).toBe(400);
  });
});
