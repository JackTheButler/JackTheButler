import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');

const COOKIE = 'jane_session';
const ALLOWED = { origin: 'https://example.com' };
let cookie = '';

const authed = (p: string, init: RequestInit = {}) =>
  app.request(p, {
    ...init,
    headers: { 'content-type': 'application/json', cookie: `${COOKIE}=${cookie}`, ...(init.headers ?? {}) },
  });

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  cookie = res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];
});

describe('webchat — inert until configured + enabled', () => {
  it('public config 404s when the app is not active', async () => {
    const r = await app.request('/widget/config', { headers: { origin: ALLOWED.origin } });
    expect(r.status).toBe(404);
  });

  it('configure + enable the webchat app', async () => {
    const cfg = await authed('/api/app/apps/webchat/config', {
      method: 'PUT',
      body: JSON.stringify({
        config: {
          title: 'Acme',
          welcomeMessage: 'Hi!',
          accentColor: '#4f46e5',
          position: 'bottom-right',
          allowedDomains: 'example.com',
        },
      }),
    });
    expect(cfg.status).toBe(200);
    const en = await authed('/api/app/apps/webchat/enable', { method: 'POST' });
    expect((await en.json()).status).toBe('active');
  });
});

describe('webchat — public config (origin-checked)', () => {
  it('returns appearance for an allowed origin', async () => {
    const r = await app.request('/widget/config', { headers: { origin: ALLOWED.origin } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      title: 'Acme',
      welcomeMessage: 'Hi!',
      accentColor: '#4f46e5',
      position: 'bottom-right',
    });
  });

  it('403 for a disallowed origin', async () => {
    expect(
      (await app.request('/widget/config', { headers: { origin: 'https://evil.com' } })).status,
    ).toBe(403);
  });

  it('403 when no origin header', async () => {
    expect((await app.request('/widget/config')).status).toBe(403);
  });
});

describe('webchat — host param (iframe origin model)', () => {
  it('validates ?host= with no Origin header (allowed)', async () => {
    const r = await app.request('/widget/config?host=https://example.com');
    expect(r.status).toBe(200);
  });

  it('rejects a disallowed ?host= even without an Origin header', async () => {
    const r = await app.request('/widget/config?host=https://evil.com');
    expect(r.status).toBe(403);
  });

  it('?host= wins over the Origin header', async () => {
    const r = await app.request('/widget/config?host=https://evil.com', {
      headers: { origin: 'https://example.com' },
    });
    expect(r.status).toBe(403);
  });
});

describe('webchat — allowed domains accept URL / host:port forms', () => {
  it('normalizes a full-URL allowlist entry to a hostname', async () => {
    await authed('/api/app/apps/webchat/config', {
      method: 'PUT',
      body: JSON.stringify({
        config: {
          title: 'Acme',
          welcomeMessage: 'Hi!',
          accentColor: '#4f46e5',
          position: 'bottom-right',
          allowedDomains: 'https://example.com:8443',
        },
      }),
    });
    expect(
      (await app.request('/widget/config?host=https://example.com')).status,
    ).toBe(200);
    expect((await app.request('/widget/config?host=https://evil.com')).status).toBe(403);

    // restore for the rest of the suite
    await authed('/api/app/apps/webchat/config', {
      method: 'PUT',
      body: JSON.stringify({
        config: {
          title: 'Acme',
          welcomeMessage: 'Hi!',
          accentColor: '#4f46e5',
          position: 'bottom-right',
          allowedDomains: 'example.com',
        },
      }),
    });
  });
});

describe('webchat — inbound message', () => {
  it('allowed origin → ingests, conversation appears in the inbox', async () => {
    const r = await app.request('/widget/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED.origin },
      body: JSON.stringify({ visitorId: 'visitor-1', content: 'hello from site' }),
    });
    expect(r.status).toBe(201);
    expect((await r.json()).conversationId).toBeTruthy();

    const { conversations } = await (await authed('/api/app/conversations')).json();
    const c = conversations.find((x: { channel: string }) => x.channel === 'webchat');
    expect(c).toBeTruthy();
    expect(c.snippet).toBe('hello from site');
  });

  it('403 for a disallowed origin', async () => {
    const r = await app.request('/widget/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.com' },
      body: JSON.stringify({ visitorId: 'v2', content: 'x' }),
    });
    expect(r.status).toBe(403);
  });

  it('400 for an invalid body', async () => {
    const r = await app.request('/widget/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED.origin },
      body: JSON.stringify({ visitorId: 'v3' }),
    });
    expect(r.status).toBe(400);
  });
});

describe('webchat — loader + bundle', () => {
  it('serves the real host-page loader', async () => {
    const r = await app.request('/widget.js');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/javascript');
    const body = await r.text();
    expect(body).toContain('JaneWidget');
    expect(body).toContain('jane_visitor_id');
  });

  it('serves the built iframe bundle', async () => {
    const r = await app.request('/widget/app/');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<div id="root">');
  });
});
