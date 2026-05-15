/**
 * Per-stage tests for the tricky bits: JSON parsing in classify-intent,
 * code extraction in detect-language, conditional skips.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyIntent,
  detectLanguage,
  type Env,
  type MessageContext,
  type Intent,
} from '../src/index.js';
import {
  createStubIntents,
  createStubPrompts,
  createStubServices,
  createStubAI,
} from './_helpers/stubs.js';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    intents: createStubIntents(),
    prompts: createStubPrompts(),
    services: createStubServices(),
    systemLanguage: 'en',
    ...overrides,
  };
}

function makeCtx(): MessageContext {
  return {
    inbound: {
      id: 'm1',
      channel: 'webchat',
      channelId: 's1',
      content: 'hello',
      createdAt: new Date(),
    },
    startTime: Date.now(),
    // detectLanguage requires a conversation now that it also persists
    // the detected code via ConversationProvider.setLanguage. In a real
    // pipeline run resolveConversation has populated this by this point.
    conversation: {
      id: 'conv-test',
      channel: 'webchat',
      channelId: 's1',
      entityId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

const SAMPLE_INTENT: Intent = {
  name: 'request.help',
  description: 'User is asking for help',
};

describe('classifyIntent — JSON parsing', () => {
  it('parses a well-formed JSON response', async () => {
    const ai = createStubAI({
      intent_classification: JSON.stringify({
        intent: 'request.help',
        confidence: 0.9,
        reasoning: 'user said help',
      }),
    });
    const env = makeEnv({
      intents: createStubIntents([SAMPLE_INTENT]),
      services: createStubServices({ ai }),
    });
    const ctx = makeCtx();

    await classifyIntent(ctx, env);

    expect(ctx.classification?.intent).toBe('request.help');
    expect(ctx.classification?.confidence).toBe(0.9);
    expect(ctx.classification?.reasoning).toBe('user said help');
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    const ai = createStubAI({
      intent_classification:
        '```json\n{"intent":"request.help","confidence":0.8}\n```',
    });
    const env = makeEnv({
      intents: createStubIntents([SAMPLE_INTENT]),
      services: createStubServices({ ai }),
    });
    const ctx = makeCtx();

    await classifyIntent(ctx, env);

    expect(ctx.classification?.intent).toBe('request.help');
    expect(ctx.classification?.confidence).toBe(0.8);
  });

  it('extracts JSON from surrounding prose', async () => {
    const ai = createStubAI({
      intent_classification:
        'Here is the result: {"intent":"request.help","confidence":0.7} — done.',
    });
    const env = makeEnv({
      intents: createStubIntents([SAMPLE_INTENT]),
      services: createStubServices({ ai }),
    });
    const ctx = makeCtx();

    await classifyIntent(ctx, env);

    expect(ctx.classification?.intent).toBe('request.help');
  });

  it('leaves classification undefined on malformed response', async () => {
    const ai = createStubAI({ intent_classification: 'not json at all' });
    const env = makeEnv({
      intents: createStubIntents([SAMPLE_INTENT]),
      services: createStubServices({ ai }),
    });
    const ctx = makeCtx();

    await classifyIntent(ctx, env);

    expect(ctx.classification).toBeUndefined();
  });

  it('clamps confidence to [0, 1]', async () => {
    const ai = createStubAI({
      intent_classification: JSON.stringify({ intent: 'x', confidence: 1.5 }),
    });
    const env = makeEnv({
      intents: createStubIntents([SAMPLE_INTENT]),
      services: createStubServices({ ai }),
    });
    const ctx = makeCtx();

    await classifyIntent(ctx, env);

    expect(ctx.classification?.confidence).toBe(1);
  });

  it('skips entirely when the catalog is empty', async () => {
    const ai = createStubAI();
    const env = makeEnv({
      intents: createStubIntents([]), // empty catalog
      services: createStubServices({ ai }),
    });
    const ctx = makeCtx();

    await classifyIntent(ctx, env);

    expect(ctx.classification).toBeUndefined();
    expect(ai.complete).not.toHaveBeenCalled();
  });
});

describe('detectLanguage — code extraction', () => {
  it('accepts a bare 2-letter code', async () => {
    const ai = createStubAI({ language_detection: 'en' });
    const env = makeEnv({ services: createStubServices({ ai }) });
    const ctx = makeCtx();

    await detectLanguage(ctx, env);

    expect(ctx.inboundLanguage).toBe('en');
  });

  it('extracts a code from surrounding text', async () => {
    const ai = createStubAI({
      language_detection: 'The language code is: fr (French).',
    });
    const env = makeEnv({ services: createStubServices({ ai }) });
    const ctx = makeCtx();

    await detectLanguage(ctx, env);

    expect(ctx.inboundLanguage).toBe('fr');
  });

  it('accepts a locale-form code', async () => {
    const ai = createStubAI({ language_detection: 'zh-cn' });
    const env = makeEnv({ services: createStubServices({ ai }) });
    const ctx = makeCtx();

    await detectLanguage(ctx, env);

    expect(ctx.inboundLanguage).toBe('zh-cn');
  });

  it('leaves inboundLanguage undefined when nothing code-like matches', async () => {
    const ai = createStubAI({ language_detection: '!!!' });
    const env = makeEnv({ services: createStubServices({ ai }) });
    const ctx = makeCtx();

    await detectLanguage(ctx, env);

    expect(ctx.inboundLanguage).toBeUndefined();
  });
});
