import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';
// Enable push so /push/key reports enabled and subscribe doesn't 503.
process.env.VAPID_PUBLIC_KEY =
  'BFvj9A1BizDUA3Ww2S1lylJWb-LlSWDTTOJs8deEp3P8rbkF0gRx9mvmei-OUGRzcVfmVQsGtBDApFJCBAhUsbQ';
process.env.VAPID_PRIVATE_KEY = 'y_G1W_RedsscEmEipkoI43LXC8Ghhd9w_EU2S-70Hmc';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');

const COOKIE = 'jane_session';
const cookieFrom = (res: Response): string =>
  res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];

function req(path: string, cookie: string | null, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

const SUB = {
  endpoint: 'https://push.example.com/sub/abc123',
  keys: { p256dh: 'p256dh-key-value', auth: 'auth-key-value' },
};

let cookie = '';

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'admin@acme.co', password: 'supersecret' }),
  });
  cookie = cookieFrom(res);
});

describe('push subscriptions', () => {
  it('requires auth', async () => {
    expect((await req('/api/app/push/key', null)).status).toBe(401);
  });

  it('reports enabled + the public VAPID key', async () => {
    const res = await req('/api/app/push/key', cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.key).toBe(process.env.VAPID_PUBLIC_KEY);
  });

  it('stores a subscription, then upserts (no duplicate) on re-subscribe', async () => {
    const first = await req('/api/app/push/subscribe', cookie, post({ subscription: SUB }));
    expect(first.status).toBe(201);
    // Same endpoint again → upsert, still succeeds (no unique-constraint blow-up).
    const again = await req(
      '/api/app/push/subscribe',
      cookie,
      post({ subscription: { ...SUB, keys: { p256dh: 'rotated', auth: 'rotated' } } }),
    );
    expect(again.status).toBe(201);
  });

  it('rejects a malformed subscription', async () => {
    const res = await req('/api/app/push/subscribe', cookie, post({ subscription: { foo: 1 } }));
    expect(res.status).toBe(400);
  });

  it('unsubscribes by endpoint', async () => {
    const res = await req('/api/app/push/unsubscribe', cookie, post({ endpoint: SUB.endpoint }));
    expect(res.status).toBe(200);
  });
});
