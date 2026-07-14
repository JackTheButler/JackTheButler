import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');
const { setAppModules } = await import('../src/modules/apps/registry.js');
const { getActiveEmbeddingInstance } = await import('../src/modules/apps/service.js');
const { stubEmbeddingModule } = await import('./fixtures/stub-embedding-app.js');

setAppModules([stubEmbeddingModule]);

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

describe('embedding capability', () => {
  it('exposes the embedding app via the standard apps framework', async () => {
    const { apps } = await (await authed('/api/app/apps')).json();
    const embed = apps.find((a: { id: string }) => a.id === 'stub-embed');
    expect(embed).toMatchObject({
      id: 'stub-embed',
      category: 'embedding',
      enabled: false,
      status: 'unconfigured',
    });
  });

  it('returns null from getActiveEmbeddingInstance until configured + enabled', async () => {
    expect(getActiveEmbeddingInstance()).toBeNull();

    // Configure + check (auto-passes for the stub).
    await authed('/api/app/apps/stub-embed/config', {
      method: 'PUT',
      body: JSON.stringify({ config: { apiKey: 'stub-key' } }),
    });
    // Still null — enabled is false right after save.
    expect(getActiveEmbeddingInstance()).toBeNull();

    await authed('/api/app/apps/stub-embed/enable', { method: 'POST' });
    const inst = getActiveEmbeddingInstance();
    expect(inst).not.toBeNull();
    const result = await inst!.embed({ texts: ['hello'] });
    expect(result.vectors).toHaveLength(1);
    expect(result.vectors[0]).toEqual([1, 0, 0]);
  });

  it('does NOT return embedding instance for a generation-capability app', async () => {
    // Sanity check: even if we register only a generation app, the
    // embedding helper still returns null. Prevents capability mix-ups.
    const { aiAnthropicModule } = await import('@janetheoperator/ai-anthropic');
    setAppModules([aiAnthropicModule]);
    expect(getActiveEmbeddingInstance()).toBeNull();
    // Restore for any tests after.
    setAppModules([stubEmbeddingModule]);
  });
});
