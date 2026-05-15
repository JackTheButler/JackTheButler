/**
 * classifyIntent stage tests
 *
 * Phase 5 verification: the stage pulls its catalog from
 * ctx.domain.intents.list() and its system prompt from
 * ctx.domain.prompts.classifier(catalog), and the classifier reads
 * department / requiresAction / requiresIdentity from catalog metadata.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent, resetClassifier } from '@/core/pipeline/stages/classify-intent.js';
import { createContext } from '@/core/pipeline/context.js';
import type { DomainAdapter } from '@/core/domain/adapter.js';
import type { Intent } from '@/core/domain/types.js';
import type { InboundMessage } from '@/types/index.js';

const mockProvider = {
  name: 'mock',
  complete: vi.fn(),
  embed: vi.fn(),
};

vi.mock('@/apps/index.js', () => ({
  getAppRegistry: () => ({
    getActiveAIProvider: () => mockProvider,
  }),
}));

const catalog: readonly Intent[] = [
  {
    name: 'request.help',
    description: 'User asks for help',
    examples: ['help', 'I need help'],
    metadata: { department: 'support', requiresAction: true, requiresIdentity: false },
  },
  {
    name: 'greeting',
    description: 'User greets the assistant',
    examples: ['hi', 'hello'],
    metadata: { department: null, requiresAction: false, requiresIdentity: false },
  },
];

const classifierPromptFn = vi.fn((c: readonly Intent[]) =>
  `Classify into: ${c.map((i) => i.name).join(', ')}`
);

const domain: DomainAdapter = {
  id: 'test',
  displayName: 'Test',
  entities: { resolve: async () => null, findById: async () => null },
  intents: {
    list: () => catalog,
    get: (name) => catalog.find((i) => i.name === name) ?? null,
  },
  prompts: {
    classifier: classifierPromptFn,
    responder: () => '',
  },
};

const inbound: InboundMessage = {
  id: 'msg-001',
  channel: 'webchat',
  channelId: 'session-001',
  content: 'I need help',
  contentType: 'text',
  timestamp: new Date(),
};

describe('classifyIntent (Phase 5)', () => {
  beforeEach(() => {
    resetClassifier();
    mockProvider.complete.mockReset();
    classifierPromptFn.mockClear();
  });

  it('reads the catalog from the domain and asks the domain for the classifier prompt', async () => {
    mockProvider.complete.mockResolvedValue({
      content: JSON.stringify({ intent: 'request.help', confidence: 0.9 }),
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const ctx = createContext(inbound, domain);
    await classifyIntent(ctx);

    expect(classifierPromptFn).toHaveBeenCalledWith(catalog);
    expect(ctx.classification?.intent).toBe('request.help');
  });

  it('populates department/requiresAction/requiresIdentity from catalog metadata', async () => {
    mockProvider.complete.mockResolvedValue({
      content: JSON.stringify({ intent: 'request.help', confidence: 0.92 }),
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const ctx = createContext(inbound, domain);
    await classifyIntent(ctx);

    expect(ctx.classification).toEqual(
      expect.objectContaining({
        intent: 'request.help',
        confidence: 0.92,
        department: 'support',
        requiresAction: true,
        requiresIdentity: false,
      })
    );
  });

  it('sends the domain-supplied system prompt to the LLM', async () => {
    mockProvider.complete.mockResolvedValue({
      content: JSON.stringify({ intent: 'greeting', confidence: 0.85 }),
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const ctx = createContext(inbound, domain);
    await classifyIntent(ctx);

    const call = mockProvider.complete.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMsg = call.messages.find((m) => m.role === 'system');
    expect(systemMsg?.content).toBe('Classify into: request.help, greeting');
  });

  it('falls back to nulls/false when classified intent is not in the catalog', async () => {
    mockProvider.complete.mockResolvedValue({
      content: JSON.stringify({ intent: 'mystery.unknown', confidence: 0.4 }),
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const ctx = createContext(inbound, domain);
    await classifyIntent(ctx);

    expect(ctx.classification?.department).toBeNull();
    expect(ctx.classification?.requiresAction).toBe(false);
    expect(ctx.classification?.requiresIdentity).toBe(false);
  });

  it('skips when the catalog is empty', async () => {
    const emptyDomain: DomainAdapter = { ...domain, intents: { list: () => [], get: () => null } };
    const ctx = createContext(inbound, emptyDomain);
    await classifyIntent(ctx);

    expect(mockProvider.complete).not.toHaveBeenCalled();
    expect(ctx.classification).toBeUndefined();
  });
});
