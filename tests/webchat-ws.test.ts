import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import WebSocket from 'ws';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app, injectWebSocket } = await import('../src/app.js');

const COOKIE = 'jane_session';
let cookie = '';
let port = 0;
let server: ReturnType<typeof serve>;

const authed = (p: string, init: RequestInit = {}) =>
  app.request(p, {
    ...init,
    headers: { 'content-type': 'application/json', cookie: `${COOKIE}=${cookie}`, ...(init.headers ?? {}) },
  });

function connect(visitorId: string, origin: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/widget/socket?visitorId=${visitorId}`, {
    headers: { origin },
  });
}

const waitOpen = (ws: WebSocket) =>
  new Promise<'open' | 'fail'>((resolve) => {
    ws.on('open', () => resolve('open'));
    ws.on('error', () => resolve('fail'));
    ws.on('unexpected-response', () => resolve('fail'));
  });

const nextMessage = (ws: WebSocket) =>
  new Promise<unknown>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no message')), 2000);
    ws.on('message', (d) => {
      clearTimeout(t);
      resolve(JSON.parse(d.toString()));
    });
  });

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      port = info.port;
      resolve();
    });
    injectWebSocket(server);
  });

  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  cookie = res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];

  await authed('/api/app/apps/webchat/config', {
    method: 'PUT',
    body: JSON.stringify({
      config: {
        title: 'Acme',
        welcomeMessage: 'Hi!',
        accentColor: '#4f46e5',
        position: 'bottom-right',
        themeDefault: 'auto',
        allowedDomains: 'example.com',
      },
    }),
  });
  await authed('/api/app/apps/webchat/enable', { method: 'POST' });
});

afterAll(() => {
  server.close();
});

describe('webchat WS gateway', () => {
  it('rejects a disallowed origin (no upgrade)', async () => {
    const ws = connect('v-evil', 'https://evil.com');
    expect(await waitOpen(ws)).toBe('fail');
    ws.close();
  });

  it('inbound over the socket creates/continues the conversation', async () => {
    const ws = connect('v-1', 'https://example.com');
    expect(await waitOpen(ws)).toBe('open');
    ws.send(JSON.stringify({ content: 'hi from socket' }));

    // ingest is synchronous in the handler; give the frame a tick to land.
    await new Promise((r) => setTimeout(r, 100));
    const { conversations } = await (await authed('/api/app/conversations')).json();
    const c = conversations.find((x: { channel: string }) => x.channel === 'webchat');
    expect(c?.snippet).toBe('hi from socket');
    ws.close();
  });

  it('agent reply is pushed to the connected widget', async () => {
    const ws = connect('v-2', 'https://example.com');
    expect(await waitOpen(ws)).toBe('open');
    ws.send(JSON.stringify({ content: 'need help' }));
    await new Promise((r) => setTimeout(r, 100));

    const { conversations } = await (await authed('/api/app/conversations')).json();
    const conv = conversations.find(
      (x: { snippet: string }) => x.snippet === 'need help',
    );
    await authed(`/api/app/conversations/${conv.id}/takeover`, { method: 'POST' });

    const incoming = nextMessage(ws);
    await authed(`/api/app/conversations/${conv.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'agent here' }),
    });

    const frame = (await incoming) as { type: string; message: { author: string; content: string } };
    expect(frame.type).toBe('message');
    expect(frame.message).toMatchObject({ author: 'agent', content: 'agent here' });
    ws.close();
  });

  it('history endpoint returns customer-visible messages', async () => {
    const r = await app.request('/widget/messages?visitorId=v-1', {
      headers: { origin: 'https://example.com' },
    });
    expect(r.status).toBe(200);
    const { messages } = await r.json();
    expect(messages.some((m: { content: string }) => m.content === 'hi from socket')).toBe(true);
    expect(messages.every((m: { author: string }) => m.author !== 'system')).toBe(true);
  });
});
