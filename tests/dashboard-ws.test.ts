import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import WebSocket from 'ws';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app, injectWebSocket } = await import('../src/app.js');

const COOKIE = 'jane_session';
let cookie = '';
let port = 0;
let server: ReturnType<typeof serve>;

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
});

afterAll(() => server.close());

describe('dashboard realtime channel', () => {
  it('rejects an unauthenticated connection', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/app/realtime`);
    expect(await waitOpen(ws)).toBe('fail');
    ws.close();
  });

  it('an authed agent receives message.created events', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/app/realtime`, {
      headers: { cookie: `${COOKIE}=${cookie}` },
    });
    expect(await waitOpen(ws)).toBe('open');

    const incoming = nextMessage(ws);
    await app.request('/api/app/conversations/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${COOKIE}=${cookie}` },
      body: JSON.stringify({ channel: 'webchat', externalId: 'v1', content: 'hi there' }),
    });

    const frame = (await incoming) as {
      type: string;
      data: { message: { content: string } };
    };
    expect(frame.type).toBe('message.created');
    expect(frame.data.message.content).toBe('hi there');
    ws.close();
  });
});
