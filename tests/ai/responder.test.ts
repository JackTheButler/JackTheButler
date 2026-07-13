/**
 * Responder Prompt Tests
 *
 * `responderPrompt` (src/core/pipeline/prompts.ts) builds the system
 * prompt for response generation — pure assembly from `ctx`/`env`, no LLM
 * call (that's owned by the package's `generateResponse` stage). Covers
 * the guest-memory block, the trickiest conditional section: present when
 * `memoryHits` are supplied, absent when empty or undefined.
 */

import { describe, it, expect, vi } from 'vitest';
import { responderPrompt } from '@/pipeline/prompts.js';
import type { ButlerContext } from '@/pipeline/context.js';
import type { Env } from '@thebutler/pipeline';

function makeEnv(overrides: Partial<Env<ButlerContext>> = {}): Env<ButlerContext> {
  return {
    intents: { list: vi.fn(() => []), get: vi.fn(() => null) },
    prompts: {
      classifier: vi.fn(() => ''),
      responder: vi.fn(async () => ''),
      detector: vi.fn(() => ''),
      translator: vi.fn(() => ''),
    },
    services: {
      entities: { resolve: vi.fn(async () => null), findById: vi.fn(async () => null) },
      ai: { name: 'stub', complete: vi.fn(async () => ({ content: '' })), embed: vi.fn(async () => ({ embedding: [] })) },
      conversation: {
        findOrCreate: vi.fn(),
        findById: vi.fn(async () => null),
        addMessage: vi.fn(),
        getRecentMessages: vi.fn(async () => []),
        setLanguage: vi.fn(async () => {}),
      },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
    systemLanguage: 'en',
    ...overrides,
  } as Env<ButlerContext>;
}

function makeCtx(overrides: Partial<ButlerContext> = {}): ButlerContext {
  return {
    inbound: {
      id: 'msg-test-001',
      channel: 'webchat',
      channelId: 'session-001',
      content: 'What time is checkout?',
      createdAt: new Date(),
    },
    startTime: Date.now(),
    entity: null,
    ...overrides,
  };
}

describe('responderPrompt', () => {
  it('includes the butler persona', async () => {
    const prompt = await responderPrompt(makeCtx(), makeEnv());
    expect(prompt).toContain('You are Jack');
  });

  it('adds a language directive when the system language is not English', async () => {
    const promptEn = await responderPrompt(makeCtx(), makeEnv({ systemLanguage: 'en' }));
    const promptFr = await responderPrompt(makeCtx(), makeEnv({ systemLanguage: 'fr' }));

    expect(promptEn).not.toContain('Respond in fr');
    expect(promptFr).toContain('Respond in fr');
  });

  describe('guest memory block', () => {
    const memoryHits = [
      { key: 'preference', value: 'Prefers feather-free pillows' },
      { key: 'habit', value: 'Always requests a late checkout' },
    ];

    it('includes the memory block when memoryHits are provided', async () => {
      const prompt = await responderPrompt(makeCtx({ memoryHits }), makeEnv());

      expect(prompt).toContain('What Jack Knows About This Guest');
      expect(prompt).toContain('preference: Prefers feather-free pillows');
      expect(prompt).toContain('habit: Always requests a late checkout');
    });

    it('omits the memory block when memoryHits is empty', async () => {
      const prompt = await responderPrompt(makeCtx({ memoryHits: [] }), makeEnv());
      expect(prompt).not.toContain('What Jack Knows About This Guest');
    });

    it('omits the memory block when memoryHits is undefined (anonymous / first-time guest)', async () => {
      const prompt = await responderPrompt(makeCtx({ memoryHits: undefined }), makeEnv());
      expect(prompt).not.toContain('What Jack Knows About This Guest');
    });
  });

  describe('knowledge hits', () => {
    const knowledgeHits = [
      { id: 'kb-001', title: 'Checkout Time', content: 'Checkout is at 11am.', similarity: 0.92 },
    ];

    it('includes matched knowledge in the system prompt', async () => {
      const prompt = await responderPrompt(makeCtx({ knowledgeHits }), makeEnv());

      expect(prompt).toContain('Relevant Hotel Information');
      expect(prompt).toContain('Checkout Time');
      expect(prompt).toContain('Checkout is at 11am.');
    });

    it('omits the knowledge section when there are no hits', async () => {
      const prompt = await responderPrompt(makeCtx({ knowledgeHits: [] }), makeEnv());
      expect(prompt).not.toContain('Relevant Hotel Information');
    });
  });

  describe('detected intent', () => {
    it('surfaces the department and an action note for actionable intents', async () => {
      const env = makeEnv({
        intents: {
          list: vi.fn(() => []),
          get: vi.fn((name: string) =>
            name === 'request.housekeeping.towels'
              ? { name, description: 'Towels', metadata: { department: 'housekeeping', requiresAction: true } }
              : null
          ),
        },
      });
      const ctx = makeCtx({ classification: { intent: 'request.housekeeping.towels', confidence: 0.9 } });

      const prompt = await responderPrompt(ctx, env);

      expect(prompt).toContain('Detected Intent: request.housekeeping.towels');
      expect(prompt).toContain('Department: housekeeping');
      expect(prompt).toContain('may require creating a task');
    });

    it('omits the detected-intent section for the unknown intent', async () => {
      const ctx = makeCtx({ classification: { intent: 'unknown', confidence: 0 } });
      const prompt = await responderPrompt(ctx, makeEnv());
      expect(prompt).not.toContain('Detected Intent');
    });
  });
});
