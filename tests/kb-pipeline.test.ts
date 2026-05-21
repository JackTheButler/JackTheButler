import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');
const { setAppModules } = await import('../src/modules/apps/registry.js');
const { events } = await import('../src/core/events.js');
const { stubGenerationModule, stubAiCalls, resetStubAi, lastResponderCall } =
  await import('./fixtures/stub-generation-app.js');
const { stubEmbeddingModule, setStubVector, resetStubEmbed } = await import(
  './fixtures/stub-embedding-app.js'
);

// Both a generation app (replies) and an embedding app (KB search) active.
setAppModules([stubGenerationModule, stubEmbeddingModule]);

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

function ingest(channel: string, externalId: string, content: string) {
  return authed('/api/app/conversations/ingest', {
    method: 'POST',
    body: JSON.stringify({ channel, externalId, content }),
  });
}

function nextAiReply(channel: string, externalId: string, timeoutMs = 500) {
  return new Promise<{ content: string }>((resolve, reject) => {
    const off = events.on('message.created', (p) => {
      if (p.channel === channel && p.channelExternalId === externalId && p.message.author === 'ai') {
        clearTimeout(t);
        off();
        resolve({ content: p.message.content });
      }
    });
    const t = setTimeout(() => {
      off();
      reject(new Error('timed out waiting for ai reply'));
    }, timeoutMs);
  });
}

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  cookie = res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];

  for (const id of ['stub-ai', 'stub-embed']) {
    await authed(`/api/app/apps/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config: { apiKey: 'stub-key' } }),
    });
    await authed(`/api/app/apps/${id}/enable`, { method: 'POST' });
  }
});

beforeEach(() => {
  resetStubAi();
  resetStubEmbed();
});

describe('KB → AI pipeline (RAG)', () => {
  it('retrieves a matching entry and injects it into the responder prompt', async () => {
    // Entry + customer question embed to the SAME vector → cosine 1.0 ≥ 0.4.
    const Q = 'What is your refund policy?';
    const ASK = 'how do I get my money back?';
    setStubVector(Q, [1, 0, 0]);
    setStubVector(ASK, [1, 0, 0]);

    await authed('/api/app/knowledge/entries', {
      method: 'POST',
      body: JSON.stringify({
        question: Q,
        answer: 'Refunds within 30 days. Email support@acme.co with your order number.',
        topic: 'Refunds',
      }),
    });

    const wait = nextAiReply('webchat', 'sess-kb-hit');
    await ingest('webchat', 'sess-kb-hit', ASK);
    await wait;

    const responder = lastResponderCall();
    expect(responder).toBeDefined();
    const system = responder!.messages.find((m) => m.role === 'system')!;
    expect(system.content).toContain('knowledge base entries');
    expect(system.content).toContain('Refunds within 30 days');
    expect(system.content).toContain('Refunds: What is your refund policy?'); // topic + question title
  });

  it('does not inject entries that fall below the similarity threshold', async () => {
    const Q = 'How do I reset my password?';
    const ASK = 'where is your office located?';
    // Orthogonal vectors → cosine 0 < 0.4 → not a hit.
    setStubVector(Q, [1, 0, 0]);
    setStubVector(ASK, [0, 1, 0]);

    await authed('/api/app/knowledge/entries', {
      method: 'POST',
      body: JSON.stringify({ question: Q, answer: 'Use the Forgot Password link.', topic: null }),
    });

    const wait = nextAiReply('webchat', 'sess-kb-miss');
    await ingest('webchat', 'sess-kb-miss', ASK);
    await wait;

    const responder = lastResponderCall()!;
    const system = responder.messages.find((m) => m.role === 'system')!;
    expect(system.content).not.toContain('Use the Forgot Password link');
    // Falls back to the persona fallback instruction instead of the KB block.
    expect(system.content).not.toContain('knowledge base entries');
  });

  it('still replies (persona-only) when no KB entries match — no crash', async () => {
    setStubVector('anything', [0, 0, 1]);
    const wait = nextAiReply('webchat', 'sess-kb-empty');
    await ingest('webchat', 'sess-kb-empty', 'random unmatched question');
    const reply = await wait;
    expect(reply.content).toBeTruthy();
    // Embedding was computed (embed app active) — there was a utility/embed call path.
    expect(stubAiCalls.length).toBeGreaterThan(0);
  });
});
