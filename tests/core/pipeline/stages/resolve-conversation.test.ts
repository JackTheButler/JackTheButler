/**
 * resolveConversation stage tests
 *
 * Phase 4 verification: the stage delegates entity resolution to
 * ctx.domain.entities.resolve(...) and links the conversation to the
 * resolved entity's id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveConversation } from '@/core/pipeline/stages/resolve-conversation.js';
import { createContext } from '@/core/pipeline/context.js';
import type { DomainAdapter } from '@/core/domain/adapter.js';
import type { Entity } from '@/core/domain/types.js';
import type { InboundMessage } from '@/types/index.js';

const conversationFindOrCreate = vi.fn();
const getContextByConversationMock = vi.fn();

vi.mock('@/services/conversation.js', () => ({
  conversationService: {
    findOrCreate: (...args: unknown[]) => conversationFindOrCreate(...args),
  },
}));

vi.mock('@/core/conversation/guest-context.js', () => ({
  guestContextService: {
    getContextByConversation: (...args: unknown[]) => getContextByConversationMock(...args),
  },
}));

vi.mock('@/utils/translation.js', () => ({
  getPropertyLanguage: vi.fn(async () => 'en'),
}));

function makeDomain(resolveResult: Entity | null): DomainAdapter {
  return {
    id: 'test',
    displayName: 'Test',
    entities: {
      resolve: vi.fn(async () => resolveResult),
      findById: vi.fn(async () => null),
    },
    intents: { list: () => [], get: () => null },
    prompts: { classifier: () => '', responder: () => '' },
  };
}

const baseInbound: Omit<InboundMessage, 'channel' | 'channelId'> = {
  id: 'msg-001',
  content: 'Hi',
  contentType: 'text',
  timestamp: new Date(),
};

describe('resolveConversation (Phase 4)', () => {
  beforeEach(() => {
    conversationFindOrCreate.mockReset();
    getContextByConversationMock.mockReset();
    getContextByConversationMock.mockResolvedValue({
      guest: null,
      reservation: null,
      conversationHistory: { totalMessages: 0, previousTopics: [] },
    });
  });

  it('delegates entity resolution to ctx.domain.entities.resolve', async () => {
    const inbound: InboundMessage = { ...baseInbound, channel: 'whatsapp', channelId: '+15551234567' };
    const entity: Entity = { id: 'gst-abc', displayName: 'Ada Lovelace', language: 'en' };
    const domain = makeDomain(entity);

    conversationFindOrCreate.mockResolvedValue({
      id: 'conv-1',
      channel: 'whatsapp',
      channelId: '+15551234567',
      guestId: 'gst-abc',
      reservationId: null,
    });

    const ctx = createContext(inbound, domain);
    await resolveConversation(ctx);

    expect(domain.entities.resolve).toHaveBeenCalledWith(inbound);
    expect(conversationFindOrCreate).toHaveBeenCalledWith('whatsapp', '+15551234567', 'gst-abc');
    expect(ctx.conversation?.guestId).toBe('gst-abc');
    expect(ctx.propertyLanguage).toBe('en');
  });

  it('creates an unlinked conversation when the resolver returns null', async () => {
    const inbound: InboundMessage = { ...baseInbound, channel: 'webchat', channelId: 'session-xyz' };
    const domain = makeDomain(null);

    conversationFindOrCreate.mockResolvedValue({
      id: 'conv-2',
      channel: 'webchat',
      channelId: 'session-xyz',
      guestId: null,
      reservationId: null,
    });

    const ctx = createContext(inbound, domain);
    await resolveConversation(ctx);

    expect(domain.entities.resolve).toHaveBeenCalledWith(inbound);
    expect(conversationFindOrCreate).toHaveBeenCalledWith('webchat', 'session-xyz', undefined);
    expect(ctx.conversation?.guestId).toBeNull();
    // No guest linkage → guest context load is skipped
    expect(getContextByConversationMock).not.toHaveBeenCalled();
  });

  it('does not touch ctx.guestContext when no guest linkage exists', async () => {
    const inbound: InboundMessage = { ...baseInbound, channel: 'webchat', channelId: 'session-xyz' };
    const domain = makeDomain(null);

    conversationFindOrCreate.mockResolvedValue({
      id: 'conv-3',
      channel: 'webchat',
      channelId: 'session-xyz',
      guestId: null,
      reservationId: null,
    });

    const ctx = createContext(inbound, domain);
    await resolveConversation(ctx);

    expect(ctx.guestContext).toBeUndefined();
  });
});
