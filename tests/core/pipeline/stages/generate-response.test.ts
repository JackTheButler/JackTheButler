/**
 * generateResponse stage tests
 *
 * Phase 6 verification: the stage builds a ResponderPromptInput from ctx
 * and asks ctx.domain.prompts.responder() for the persona prompt, then
 * hands that prompt to the underlying responder.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateResponse } from '@/core/pipeline/stages/generate-response.js';
import { createContext } from '@/core/pipeline/context.js';
import type { DomainAdapter } from '@/core/domain/adapter.js';
import type { Entity, Intent } from '@/core/domain/types.js';
import type { ResponderPromptInput } from '@/core/domain/prompt-templates.js';
import type { InboundMessage } from '@/types/index.js';
import type { Conversation, GuestMemory } from '@/db/schema.js';
import type { KnowledgeSearchResult } from '@/core/ai/knowledge/index.js';

const generateMock = vi.fn();

vi.mock('@/core/ai/index.js', () => ({
  defaultResponder: {
    generate: (...args: unknown[]) => generateMock(...args),
  },
}));

const responderPromptMock = vi.fn(
  (_input: ResponderPromptInput) => 'PERSONA PROMPT FROM DOMAIN'
);

const helpIntent: Intent = {
  name: 'request.help',
  description: 'User asks for help',
  examples: ['help'],
};

const domain: DomainAdapter = {
  id: 'test',
  displayName: 'Test',
  entities: { resolve: async () => null, findById: async () => null },
  intents: {
    list: () => [helpIntent],
    get: (name) => (name === 'request.help' ? helpIntent : null),
  },
  prompts: {
    classifier: () => '',
    responder: responderPromptMock,
  },
};

const inbound: InboundMessage = {
  id: 'msg-001',
  channel: 'webchat',
  channelId: 'sess-001',
  content: 'help please',
  contentType: 'text',
  timestamp: new Date(),
};

const conversation: Conversation = {
  id: 'conv-1',
  channelType: 'webchat',
  channelId: 'sess-001',
  state: 'active',
  guestId: null,
  reservationId: null,
  assignedTo: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  closedAt: null,
  lastMessageAt: null,
  metadata: null,
  guestLanguage: null,
  escalationReason: null,
  resolvedAt: null,
} as unknown as Conversation;

describe('generateResponse (Phase 6)', () => {
  beforeEach(() => {
    generateMock.mockReset();
    generateMock.mockResolvedValue({ content: 'sure thing', confidence: 0.9, intent: 'request.help' });
    responderPromptMock.mockClear();
  });

  it('builds ResponderPromptInput from ctx and asks domain for the prompt', async () => {
    const entity: Entity = { id: 'e1', displayName: 'Test User', language: 'en' };
    const knowledge: KnowledgeSearchResult[] = [
      { id: 'k1', title: 'Wifi', content: 'Use Hotel_Guest', similarity: 0.9 },
    ];
    const memory: GuestMemory = {
      id: 'm1',
      guestId: 'e1',
      conversationId: null,
      category: 'preference',
      content: 'likes early check-in',
      source: 'ai_extracted',
      confidence: 0.9,
      embedding: null,
      createdAt: '',
      lastReinforcedAt: '',
    } as GuestMemory;

    const ctx = createContext(inbound, domain);
    ctx.conversation = conversation;
    ctx.entity = entity;
    ctx.classification = {
      intent: 'request.help',
      confidence: 0.9,
      department: null,
      requiresAction: false,
      requiresIdentity: false,
    };
    ctx.knowledgeResults = knowledge;
    ctx.memories = [memory];

    await generateResponse(ctx);

    expect(responderPromptMock).toHaveBeenCalledTimes(1);
    const input = responderPromptMock.mock.calls[0]![0];
    expect(input.entity).toBe(entity);
    expect(input.intent).toEqual(helpIntent);
    expect(input.knowledgeHits).toEqual([
      { title: 'Wifi', content: 'Use Hotel_Guest', similarity: 0.9 },
    ]);
    expect(input.memoryHits).toEqual([{ key: 'preference', value: 'likes early check-in' }]);
  });

  it('passes the domain persona prompt to the underlying responder', async () => {
    const ctx = createContext(inbound, domain);
    ctx.conversation = conversation;

    await generateResponse(ctx);

    // responder.generate(conversation, message, personaPrompt, ...)
    const call = generateMock.mock.calls[0]!;
    expect(call[0]).toBe(conversation);
    expect(call[1]).toBe(inbound);
    expect(call[2]).toBe('PERSONA PROMPT FROM DOMAIN');
  });

  it('returns early when there is no conversation in ctx', async () => {
    const ctx = createContext(inbound, domain);
    // ctx.conversation intentionally unset
    await generateResponse(ctx);

    expect(responderPromptMock).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('handles null entity / no intent / empty knowledge & memories', async () => {
    const ctx = createContext(inbound, domain);
    ctx.conversation = conversation;
    // entity, classification, knowledgeResults, memories all left undefined

    await generateResponse(ctx);

    const input = responderPromptMock.mock.calls[0]![0];
    expect(input.entity).toBeNull();
    expect(input.intent).toBeNull();
    expect(input.knowledgeHits).toEqual([]);
    expect(input.memoryHits).toEqual([]);
  });
});
