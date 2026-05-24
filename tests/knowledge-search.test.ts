import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');
const { setAppModules } = await import('../src/modules/apps/registry.js');
const { stubEmbeddingModule, setStubVector } = await import('./fixtures/stub-embedding-app.js');
const { stubGenerationModule, setStubAiReply } = await import('./fixtures/stub-generation-app.js');

setAppModules([stubEmbeddingModule, stubGenerationModule]);

const COOKIE = 'jane_session';
let cookie = '';

function authed(path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

interface SearchResponse {
  matches: Array<{ id: string; question: string; answer: string; topic: string | null; similarity: number }>;
  error?: string;
}

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  cookie = res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];
});

describe('knowledge search (copilot)', () => {
  it('requires auth', async () => {
    const res = await app.request('/api/app/knowledge/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'refund' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects an empty query', async () => {
    const res = await authed('/api/app/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns no_embedding when no embedding provider is active', async () => {
    const res = await authed('/api/app/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'refund' }),
    });
    const data = (await res.json()) as SearchResponse;
    expect(data).toEqual({ matches: [], error: 'no_embedding' });
  });

  it('returns ranked matches once an embedding provider is active', async () => {
    await authed('/api/app/apps/stub-embed/config', {
      method: 'PUT',
      body: JSON.stringify({ config: { apiKey: 'stub-key' } }),
    });
    await authed('/api/app/apps/stub-embed/enable', { method: 'POST' });

    await authed('/api/app/knowledge/entries', {
      method: 'POST',
      body: JSON.stringify({ question: 'How do I get a refund?', answer: 'Email support.', topic: 'Refunds' }),
    });
    // Query embeds to the same vector as the entry's content (stub default).
    setStubVector('refund please', [1, 0, 0]);

    const res = await authed('/api/app/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'refund please' }),
    });
    const data = (await res.json()) as SearchResponse;
    expect(data.error).toBeUndefined();
    expect(data.matches.length).toBeGreaterThan(0);
    expect(data.matches[0]).toMatchObject({ question: 'How do I get a refund?', topic: 'Refunds' });
    expect(data.matches[0].similarity).toBeGreaterThan(0.99);
  });
});

describe('copilot generate-reply', () => {
  let entryId = '';

  beforeAll(async () => {
    await authed('/api/app/apps/stub-ai/config', {
      method: 'PUT',
      body: JSON.stringify({ config: { apiKey: 'stub-key' } }),
    });
    await authed('/api/app/apps/stub-ai/enable', { method: 'POST' });
    const res = await authed('/api/app/knowledge/entries', {
      method: 'POST',
      body: JSON.stringify({ question: 'Return window?', answer: '30 days.', topic: 'Returns' }),
    });
    entryId = ((await res.json()) as { id: string }).id;
  });

  it('rejects empty entryIds', async () => {
    const res = await authed('/api/app/knowledge/generate-reply', {
      method: 'POST',
      body: JSON.stringify({ entryIds: [], question: 'how long to return?' }),
    });
    expect(res.status).toBe(400);
  });

  it('drafts a reply grounded in the selected entries', async () => {
    setStubAiReply('You can return items within 30 days.');
    const res = await authed('/api/app/knowledge/generate-reply', {
      method: 'POST',
      body: JSON.stringify({ entryIds: [entryId], question: 'how long do I have to return?' }),
    });
    const data = (await res.json()) as { reply?: string; error?: string };
    expect(data.error).toBeUndefined();
    expect(data.reply).toBe('You can return items within 30 days.');
  });
});
