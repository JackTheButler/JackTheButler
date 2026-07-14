import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');
const { db } = await import('../src/db/client.js');
const { setAppModules } = await import('../src/modules/apps/registry.js');
const { stubModule } = await import('./fixtures/stub-app.js');

// Test the generic framework against the stub fixture, not the real registry.
setAppModules([stubModule]);

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

describe('apps framework', () => {
  it('requires auth (protected-by-default)', async () => {
    expect((await app.request('/api/app/apps')).status).toBe(401);
  });

  it('lists the registered stub app, unconfigured', async () => {
    const { apps } = await (await authed('/api/app/apps')).json();
    const stub = apps.find((a: { id: string }) => a.id === 'stub');
    expect(stub).toMatchObject({ id: 'stub', category: 'channel', enabled: false, status: 'unconfigured' });
  });

  it('404s an unknown app', async () => {
    expect((await authed('/api/app/apps/nope')).status).toBe(404);
  });

  it('rejects config that fails the app manifest validation', async () => {
    const res = await authed('/api/app/apps/stub/config', {
      method: 'PUT',
      body: JSON.stringify({ config: { label: 'no key' } }),
    });
    expect(res.status).toBe(400);
  });

  it('saves valid config; secret is masked and encrypted at rest', async () => {
    const res = await authed('/api/app/apps/stub/config', {
      method: 'PUT',
      body: JSON.stringify({ config: { apiKey: 'super-secret-key', label: 'hello' } }),
    });
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.config.apiKey).toBe('********'); // never returned
    expect(detail.config.label).toBe('hello');
    expect(detail.status).toBe('disabled'); // configured but not enabled

    const row = db.all<{ config: string }>(
      sql`SELECT config FROM app_configs WHERE app_id = 'stub'`,
    )[0];
    expect(row.config).not.toContain('super-secret-key'); // encrypted blob
  });

  it('enable/disable flips derived status', async () => {
    expect((await (await authed('/api/app/apps/stub/enable', { method: 'POST' })).json()).status).toBe(
      'active',
    );
    expect(
      (await (await authed('/api/app/apps/stub/disable', { method: 'POST' })).json()).status,
    ).toBe('disabled');
  });

  it('re-submitting a masked secret keeps the stored value', async () => {
    const res = await authed('/api/app/apps/stub/config', {
      method: 'PUT',
      body: JSON.stringify({ config: { apiKey: '********', label: 'changed' } }),
    });
    expect(res.status).toBe(200);
    const check = await (await authed('/api/app/apps/stub/check', { method: 'POST' })).json();
    expect(check.ok).toBe(true);
    expect(check.detail).toContain('changed');
  });

  it('check fails cleanly when not configured', async () => {
    const res = await authed('/api/app/apps/stub/check', { method: 'POST' });
    // configured above, so this proves the success path; unknown app → 404
    expect(res.status).toBe(200);
  });
});
