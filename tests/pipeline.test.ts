import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');
const { setAppModules } = await import('../src/modules/apps/registry.js');
const { events } = await import('../src/core/events.js');
const {
  stubGenerationModule,
  stubAiCalls,
  resetStubAi,
  setStubAiReply,
} = await import('./fixtures/stub-generation-app.js');

// Replace the real registry with just our stub AI module. The webchat
// ingest still works — channels aren't required for /api/app dev driver.
setAppModules([stubGenerationModule]);

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

async function ingest(channel: string, externalId: string, content: string) {
  // Authenticated dev driver — matches the route in conversations/routes.ts.
  return authed('/api/app/conversations/ingest', {
    method: 'POST',
    body: JSON.stringify({ channel, externalId, content }),
  });
}

/** Subscribe BEFORE ingest. The stub generator is synchronous enough that
 *  subscribing after the HTTP roundtrip can miss the AI 'message.created'.
 *  Returns the AI message payload (content, conversationId). */
function nextAiReply(
  channel: string,
  externalId: string,
  timeoutMs = 500,
): Promise<{ content: string; conversationId: string }> {
  return new Promise((resolve, reject) => {
    const off = events.on('message.created', (p) => {
      if (
        p.channel === channel &&
        p.channelExternalId === externalId &&
        p.message.author === 'ai'
      ) {
        clearTimeout(t);
        off();
        resolve({ content: p.message.content, conversationId: p.conversationId });
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

  // Configure + enable the stub generation app so getActiveGenerationInstance
  // returns it during ingest.
  await authed('/api/app/apps/stub-ai/config', {
    method: 'PUT',
    body: JSON.stringify({ config: { apiKey: 'stub-key' } }),
  });
  await authed('/api/app/apps/stub-ai/enable', { method: 'POST' });
});

beforeEach(() => {
  resetStubAi();
});

describe('AI pipeline', () => {
  it('skips when no generation app is active', async () => {
    // Disable, ingest, confirm no LLM call and no ai message persisted.
    await authed('/api/app/apps/stub-ai/disable', { method: 'POST' });
    const res = await ingest('webchat', 'sess-skip', 'hello?');
    expect(res.status).toBe(201);
    const { conversationId } = await res.json();

    // Give any (incorrectly fired) async work a tick to run before asserting.
    await new Promise((r) => setTimeout(r, 30));
    expect(stubAiCalls).toHaveLength(0);

    const convo = await (
      await authed(`/api/app/conversations/${conversationId}`)
    ).json();
    expect(convo.messages.filter((m: { author: string }) => m.author === 'ai')).toHaveLength(0);

    // Re-enable for the rest of the suite.
    await authed('/api/app/apps/stub-ai/enable', { method: 'POST' });
  });

  it('generates a reply and persists it as an `ai` message', async () => {
    setStubAiReply('hi, this is the assistant');
    const wait = nextAiReply('webchat', 'sess-1');
    await ingest('webchat', 'sess-1', 'hello?');
    const { content, conversationId } = await wait;
    expect(content).toBe('hi, this is the assistant');

    const convo = await (
      await authed(`/api/app/conversations/${conversationId}`)
    ).json();
    const ai = convo.messages.filter((m: { author: string }) => m.author === 'ai');
    expect(ai).toHaveLength(1);
    expect(ai[0].content).toBe('hi, this is the assistant');
  });

  it('builds the system prompt from assistant_profile', async () => {
    // Customize the persona so we can assert it surfaced in the prompt.
    await authed('/api/app/assistant', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Ada',
        tone: 'Professional',
        instructions: 'Be terse.',
        fallback: 'I will get a teammate.',
        topicsToAvoid: 'legal advice',
      }),
    });
    const wait = nextAiReply('webchat', 'sess-2');
    await ingest('webchat', 'sess-2', 'hey');
    await wait;

    expect(stubAiCalls).toHaveLength(1);
    const system = stubAiCalls[0].messages.find((m) => m.role === 'system')!;
    expect(system.content).toContain('You are Ada');
    expect(system.content).toContain('Voice: professional');
    expect(system.content).toContain('Be terse.');
    expect(system.content).toContain('legal advice');
    expect(system.content).toContain('I will get a teammate.');
  });

  it('feeds prior turns as history, excluding the current inbound', async () => {
    // Two turns on a fresh conversation. The second turn's LLM call should
    // see the first user turn + the first AI reply as history, and
    // "second" as the new user message — but NOT see "second" inside history.
    const wait1 = nextAiReply('webchat', 'sess-hist');
    await ingest('webchat', 'sess-hist', 'first');
    await wait1;

    resetStubAi();
    const wait2 = nextAiReply('webchat', 'sess-hist');
    await ingest('webchat', 'sess-hist', 'second');
    await wait2;

    expect(stubAiCalls).toHaveLength(1);
    const call = stubAiCalls[0];
    const userTurns = call.messages.filter((m) => m.role === 'user');
    const assistantTurns = call.messages.filter((m) => m.role === 'assistant');
    expect(userTurns.map((m) => m.content)).toEqual(['first', 'second']);
    expect(assistantTurns).toHaveLength(1);
  });

  it('clears last_error on a successful turn', async () => {
    setStubAiReply('ok');
    const wait = nextAiReply('webchat', 'sess-3');
    await ingest('webchat', 'sess-3', 'hi');
    await wait;

    const detail = await (await authed('/api/app/apps/stub-ai')).json();
    expect(detail.lastError).toBeNull();
  });
});
