import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');
const { setAppModules } = await import('../src/modules/apps/registry.js');
const { stubEmbeddingModule, setStubVector, stubEmbedCalls } = await import(
  './fixtures/stub-embedding-app.js'
);
const { stubGenerationModule, setStubAiReply, setStubDetectedLanguage, setStubTranslation } =
  await import('./fixtures/stub-generation-app.js');

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

interface AskEvent {
  type: string;
  phase?: string;
  reason?: string;
  text?: string;
  matches?: Array<{ id: string; question: string; topic: string | null; score: number }>;
}

/** Read the NDJSON stream to completion and parse the events. */
async function askEvents(question: string): Promise<AskEvent[]> {
  const res = await authed('/api/app/knowledge/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
  expect(res.status).toBe(200);
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as AskEvent);
}

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  cookie = res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];
});

describe('knowledge ask (test sandbox)', () => {
  it('requires auth', async () => {
    const noCookie = await app.request('/api/app/knowledge/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'hi' }),
    });
    expect(noCookie.status).toBe(401);
  });

  it('rejects an empty question', async () => {
    const res = await authed('/api/app/knowledge/ask', {
      method: 'POST',
      body: JSON.stringify({ question: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('streams a no_embedding error when no embedding provider is active', async () => {
    const events = await askEvents('How do I get a refund?');
    expect(events).toEqual([{ type: 'error', reason: 'no_embedding' }]);
  });

  it('streams phase → matches → answer → done with providers active', async () => {
    // Activate stub embedding + generation.
    for (const id of ['stub-embed', 'stub-ai']) {
      await authed(`/api/app/apps/${id}/config`, {
        method: 'PUT',
        body: JSON.stringify({ config: { apiKey: 'stub-key' } }),
      });
      await authed(`/api/app/apps/${id}/enable`, { method: 'POST' });
    }

    // An entry to retrieve (embedded on add via the stub).
    await authed('/api/app/knowledge/entries', {
      method: 'POST',
      body: JSON.stringify({ question: 'How do I get a refund?', answer: 'Email support.' }),
    });

    setStubAiReply('Just email support and we’ll sort it out.');

    const events = await askEvents('refund please');
    const types = events.map((e) => e.type);
    expect(types).toEqual(['phase', 'phase', 'matches', 'phase', 'answer', 'done']);

    expect(events[0]).toMatchObject({ type: 'phase', phase: 'embedding' });
    expect(events[1]).toMatchObject({ type: 'phase', phase: 'searching' });

    const matches = events.find((e) => e.type === 'matches')!.matches!;
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].question).toBe('How do I get a refund?');

    expect(events.find((e) => e.type === 'answer')).toMatchObject({
      type: 'answer',
      text: 'Just email support and we’ll sort it out.',
    });
  });

  it('strict KB-only: zero matches return the fallback without generating', async () => {
    // Distinct fallback to assert against (assistant routes are admin-only).
    await authed('/api/app/assistant', {
      method: 'PUT',
      body: JSON.stringify({ fallback: 'Let me connect you to a teammate.' }),
    });
    // Query embeds orthogonal to the only entry ([1,0,0]) → cosine 0 → no hit.
    setStubVector('what is the meaning of life', [0, 1, 0]);

    const events = await askEvents('what is the meaning of life');
    // No 'generating' phase — we short-circuit before calling the model.
    expect(events.map((e) => e.type)).toEqual(['phase', 'phase', 'matches', 'answer', 'done']);
    expect(events.find((e) => e.type === 'matches')!.matches).toEqual([]);
    expect(events.find((e) => e.type === 'answer')).toMatchObject({
      text: 'Let me connect you to a teammate.',
    });
  });

  it('translates a foreign-language question for retrieval and the answer back', async () => {
    // Asker writes Farsi; system/KB language is English (seeded default 'en').
    setStubDetectedLanguage('fa');
    // Inbound: the Farsi question translates to the English entry's wording so
    // it retrieves the same approved entry the English path does.
    setStubTranslation('fa', 'en', 'How do I get a refund?');
    setStubAiReply('Just email support.');
    // Outbound: the English answer translates back to Farsi for delivery.
    setStubTranslation('en', 'fa', 'فقط به پشتیبانی ایمیل بزنید.');

    stubEmbedCalls.length = 0;
    const events = await askEvents('چطور پولم را پس بگیرم؟');

    // We embedded the English translation, not the raw Farsi question.
    const askEmbed = stubEmbedCalls.at(-1);
    expect(askEmbed?.texts).toEqual(['How do I get a refund?']);

    // Retrieved the entry, and the answer came back in the asker's language.
    expect(events.find((e) => e.type === 'matches')!.matches!.length).toBeGreaterThan(0);
    expect(events.find((e) => e.type === 'answer')).toMatchObject({
      text: 'فقط به پشتیبانی ایمیل بزنید.',
    });

    setStubDetectedLanguage('en'); // reset so we don't leak into later runs
  });
});
