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
  setStubDetectedLanguage,
  setStubTranslation,
  lastResponderCall,
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

    // Detect + (no translate, same lang) + responder. Find the responder
    // call by purpose — detect/translate use the utility tier.
    const responder = lastResponderCall();
    expect(responder).toBeDefined();
    const system = responder!.messages.find((m) => m.role === 'system')!;
    expect(system.content).toContain('You are Ada');
    expect(system.content).toContain('Voice: professional');
    expect(system.content).toContain('Be terse.');
    expect(system.content).toContain('legal advice');
    expect(system.content).toContain('I will get a teammate.');
    expect(system.content).toContain('Respond in en'); // default systemLanguage
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

    const responder = lastResponderCall()!;
    const userTurns = responder.messages.filter((m) => m.role === 'user');
    const assistantTurns = responder.messages.filter((m) => m.role === 'assistant');
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

  it('enriches the saved inbound row with detected language + emits message.updated (same-lang)', async () => {
    // Default flow: detect returns 'en', system is 'en', no translation runs.
    // The inbound row should still get language='en' and translation=null.
    const updates: Array<{ messageId: string; language: string | null; translation: string | null }> = [];
    const off = events.on('message.updated', (p) =>
      updates.push({ messageId: p.messageId, language: p.language, translation: p.translation }),
    );

    const wait = nextAiReply('webchat', 'sess-enrich');
    const res = await ingest('webchat', 'sess-enrich', 'hello there');
    const { conversationId } = await res.json();
    await wait;
    off();

    const convo = await (
      await authed(`/api/app/conversations/${conversationId}`)
    ).json();
    const inbound = convo.messages.find((m: { author: string }) => m.author === 'customer');
    expect(inbound.language).toBe('en');
    expect(inbound.translation).toBeNull();

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      messageId: inbound.id,
      language: 'en',
      translation: null,
    });
  });

  it('translates when customer language differs from system; AI sees the translation; outbound is translated back', async () => {
    // Stub the detector to say the customer wrote Farsi; system is English.
    setStubDetectedLanguage('fa');
    setStubTranslation('fa', 'en', 'Where is my order?');
    setStubTranslation('en', 'fa', 'سفارش شما در راه است.');
    setStubAiReply('Your order is on its way.');

    const wait = nextAiReply('webchat', 'sess-translate');
    const res = await ingest('webchat', 'sess-translate', 'سفارش من کجاست؟');
    const { conversationId } = await res.json();
    const reply = await wait;

    // 1. Responder saw the translated English question in its user turn,
    //    not the raw Farsi.
    const responder = lastResponderCall()!;
    const lastUser = responder.messages.filter((m) => m.role === 'user').pop()!;
    expect(lastUser.content).toBe('Where is my order?');

    // 2. Inbound row has language='fa', translation in default lang.
    const convo = await (
      await authed(`/api/app/conversations/${conversationId}`)
    ).json();
    const inbound = convo.messages.find((m: { author: string }) => m.author === 'customer');
    expect(inbound).toMatchObject({
      content: 'سفارش من کجاست؟',
      language: 'fa',
      translation: 'Where is my order?',
    });

    // 3. Outbound row stores content (default lang) + translation (customer lang).
    const outbound = convo.messages.find((m: { author: string }) => m.author === 'ai');
    expect(outbound).toMatchObject({
      content: 'Your order is on its way.',
      language: 'en',
      translation: 'سفارش شما در راه است.',
    });
    // 4. The 'message.created' event for the AI row delivers the customer-lang
    //    version on `content` field of the event (translation when present —
    //    today the event carries content of the persisted row; the widget
    //    will prefer translation in Phase 2d). For now: confirm reply arrived.
    expect(reply.content).toBe('Your order is on its way.');
  });

  it('translates staff replies into the customer language', async () => {
    // Set up: an established Farsi conversation, staff takes over, types
    // in English (default). The reply should be persisted with
    // language='en', translation=<farsi>, and the 'message.created' event
    // should carry both.
    setStubDetectedLanguage('fa');
    setStubTranslation('fa', 'en', 'Hi, status of my order?');
    setStubTranslation('en', 'fa', 'سلام، چه کمکی می‌توانم بکنم؟'); // AI's outbound first
    setStubTranslation('en', 'fa', 'Hello — your order ships tomorrow. (fa)');
    setStubAiReply('Hello! How can I help?');

    const wait = nextAiReply('webchat', 'sess-staff-reply');
    const res = await ingest('webchat', 'sess-staff-reply', 'سلام، سفارش من کجاست؟');
    const { conversationId } = await res.json();
    await wait;

    // Stage staff-reply translation specifically.
    setStubTranslation('en', 'fa', 'سفارش شما فردا ارسال می‌شود.');

    await authed(`/api/app/conversations/${conversationId}/takeover`, { method: 'POST' });
    const replyRes = await authed(
      `/api/app/conversations/${conversationId}/reply`,
      {
        method: 'POST',
        body: JSON.stringify({ content: 'Your order ships tomorrow.' }),
      },
    );
    expect(replyRes.status).toBe(200);

    const convo = await (
      await authed(`/api/app/conversations/${conversationId}`)
    ).json();
    const agentMsg = convo.messages.findLast((m: { author: string }) => m.author === 'agent');
    expect(agentMsg).toMatchObject({
      content: 'Your order ships tomorrow.',
      language: 'en',
      translation: 'سفارش شما فردا ارسال می‌شود.',
    });
  });

  it('persists staff reply with translation=null when languages match', async () => {
    // Same-language flow: no translation should happen even though we
    // configured a stub translator.
    setStubDetectedLanguage('en');
    setStubAiReply('Hello.');

    const wait = nextAiReply('webchat', 'sess-staff-samelang');
    const res = await ingest('webchat', 'sess-staff-samelang', 'hi');
    const { conversationId } = await res.json();
    await wait;

    await authed(`/api/app/conversations/${conversationId}/takeover`, { method: 'POST' });
    await authed(`/api/app/conversations/${conversationId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Sure, happy to help.' }),
    });

    const convo = await (
      await authed(`/api/app/conversations/${conversationId}`)
    ).json();
    const agentMsg = convo.messages.findLast((m: { author: string }) => m.author === 'agent');
    expect(agentMsg).toMatchObject({
      content: 'Sure, happy to help.',
      language: 'en',
      translation: null,
    });
  });

  it('rebuilds the pipeline when business default language changes', async () => {
    // Switch system language to Farsi, then send a message in English.
    // The responder's system prompt should now contain "Respond in fa".
    await authed('/api/app/business', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Acme',
        supportEmail: null,
        defaultLanguage: 'fa',
      }),
    });
    setStubDetectedLanguage('en'); // customer writes English

    const wait = nextAiReply('webchat', 'sess-lang-change');
    await ingest('webchat', 'sess-lang-change', 'hello');
    await wait;

    const responder = lastResponderCall()!;
    const system = responder.messages.find((m) => m.role === 'system')!;
    expect(system.content).toContain('Respond in fa');

    // Reset for any tests that run after.
    await authed('/api/app/business', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Acme',
        supportEmail: null,
        defaultLanguage: 'en',
      }),
    });
  });
});
