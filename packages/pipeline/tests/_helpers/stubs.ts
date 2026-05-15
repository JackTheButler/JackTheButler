/**
 * Stub implementations of every contract, useful for tests. Each stub
 * uses `vi.fn()` so tests can assert on call counts and arguments.
 */

import { vi } from 'vitest';
import type {
  Intent,
  IntentProvider,
  PromptProvider,
  EntityProvider,
  ConversationProvider,
  AIProvider,
  KnowledgeProvider,
  MemoryProvider,
  Logger,
  Entity,
  Conversation,
  Services,
} from '../../src/index.js';

export function createStubIntents(intents: Intent[] = []): IntentProvider {
  return {
    list: vi.fn(() => intents),
    get: vi.fn((name: string) => intents.find((i) => i.name === name) ?? null),
  };
}

export function createStubPrompts(): PromptProvider {
  return {
    classifier: vi.fn(() => 'stub classifier prompt'),
    // responder now takes (ctx, env); ignore both in the stub
    responder: vi.fn(() => 'stub responder prompt'),
    detector: vi.fn(() => 'stub detector prompt'),
    translator: vi.fn((from: string, to: string) => `stub translator ${from}->${to}`),
  };
}

export function createStubEntities(opts: { entity?: Entity | null } = {}): EntityProvider {
  return {
    resolve: vi.fn(async () => opts.entity ?? null),
    findById: vi.fn(async (id: string) => (opts.entity?.id === id ? opts.entity : null)),
  };
}

export function createStubConversation(): ConversationProvider {
  let counter = 0;
  return {
    findOrCreate: vi.fn(async (channel, channelId, entityId): Promise<Conversation> => {
      return {
        id: `conv-${++counter}`,
        channel,
        channelId,
        entityId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
    findById: vi.fn(async () => null),
    addMessage: vi.fn(async () => ({ id: `msg-${++counter}` })),
    getRecentMessages: vi.fn(async () => []),
    setLanguage: vi.fn(async () => {}),
  };
}

/**
 * AI stub that returns reasonable responses based on the `purpose` tag.
 * Override `responses` to customize behavior for a specific test.
 */
export function createStubAI(responses: Partial<Record<string, string>> = {}): AIProvider {
  const defaults: Record<string, string> = {
    intent_classification: JSON.stringify({ intent: 'unknown', confidence: 0.5 }),
    language_detection: 'en',
    translation: '[translated]',
    response_generation: 'Hello! How can I help?',
  };
  return {
    name: 'stub',
    complete: vi.fn(async (req) => {
      const tag = req.purpose ?? '';
      const content = responses[tag] ?? defaults[tag] ?? 'stub response';
      return { content };
    }),
    embed: vi.fn(async () => ({ embedding: [0.1, 0.2, 0.3] as readonly number[] })),
  };
}

export function createStubLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

export function createStubKnowledge(): KnowledgeProvider {
  return {
    search: vi.fn(async () => []),
  };
}

export function createStubMemory(): MemoryProvider {
  return {
    recall: vi.fn(async () => []),
    save: vi.fn(async () => ({ id: 'mem-1' })),
  };
}

/**
 * Build a full Services bundle with all stubs. Override any field by
 * passing it in `overrides`.
 */
export function createStubServices(overrides: Partial<Services> = {}): Services {
  return {
    entities: createStubEntities(),
    ai: createStubAI(),
    conversation: createStubConversation(),
    logger: createStubLogger(),
    ...overrides,
  };
}
