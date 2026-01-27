/**
 * Message Processor Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MessageProcessor } from '@/pipeline/processor.js';
import { EchoResponder } from '@/pipeline/responder.js';
import { ConversationService } from '@/services/conversation.js';
import { db, conversations, messages } from '@/db/index.js';
import { eq, like } from 'drizzle-orm';
import type { InboundMessage } from '@/types/index.js';

describe('MessageProcessor', () => {
  let processor: MessageProcessor;
  let conversationService: ConversationService;
  const testPrefix = `proc-${Date.now()}`;

  beforeEach(async () => {
    conversationService = new ConversationService();
    processor = new MessageProcessor(conversationService, new EchoResponder());
  });

  describe('process', () => {
    it('should create a conversation and return echo response', async () => {
      const inbound: InboundMessage = {
        id: `${testPrefix}-msg-001`,
        channel: 'webchat',
        channelId: `${testPrefix}-session-123`,
        content: 'Hello, I need help',
        contentType: 'text',
        timestamp: new Date(),
      };

      const response = await processor.process(inbound);

      expect(response.content).toBe('Echo: Hello, I need help');
      expect(response.contentType).toBe('text');
      expect(response.conversationId).toBeDefined();

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, response.conversationId));
      await db.delete(conversations).where(eq(conversations.id, response.conversationId));
    });

    it('should store inbound and outbound messages', async () => {
      const inbound: InboundMessage = {
        id: `${testPrefix}-msg-002`,
        channel: 'webchat',
        channelId: `${testPrefix}-session-456`,
        content: 'Test message',
        contentType: 'text',
        timestamp: new Date(),
      };

      const response = await processor.process(inbound);

      // Check messages were saved
      const savedMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, response.conversationId));

      expect(savedMessages).toHaveLength(2);

      const inboundMsg = savedMessages.find((m) => m.direction === 'inbound');
      const outboundMsg = savedMessages.find((m) => m.direction === 'outbound');

      expect(inboundMsg?.content).toBe('Test message');
      expect(inboundMsg?.senderType).toBe('guest');
      expect(outboundMsg?.content).toBe('Echo: Test message');
      expect(outboundMsg?.senderType).toBe('ai');

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, response.conversationId));
      await db.delete(conversations).where(eq(conversations.id, response.conversationId));
    });

    it('should reuse existing active conversation', async () => {
      const sessionId = `${testPrefix}-session-789`;

      const inbound1: InboundMessage = {
        id: `${testPrefix}-msg-003`,
        channel: 'webchat',
        channelId: sessionId,
        content: 'First message',
        contentType: 'text',
        timestamp: new Date(),
      };

      const inbound2: InboundMessage = {
        id: `${testPrefix}-msg-004`,
        channel: 'webchat',
        channelId: sessionId,
        content: 'Second message',
        contentType: 'text',
        timestamp: new Date(),
      };

      const response1 = await processor.process(inbound1);
      const response2 = await processor.process(inbound2);

      expect(response1.conversationId).toBe(response2.conversationId);

      // Should have 4 messages (2 inbound, 2 outbound)
      const savedMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, response1.conversationId));

      expect(savedMessages).toHaveLength(4);

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, response1.conversationId));
      await db.delete(conversations).where(eq(conversations.id, response1.conversationId));
    });

    it('should update conversation lastMessageAt', async () => {
      const inbound: InboundMessage = {
        id: `${testPrefix}-msg-005`,
        channel: 'webchat',
        channelId: `${testPrefix}-session-abc`,
        content: 'Check timestamp',
        contentType: 'text',
        timestamp: new Date(),
      };

      const response = await processor.process(inbound);

      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, response.conversationId));

      expect(conv.lastMessageAt).toBeDefined();

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, response.conversationId));
      await db.delete(conversations).where(eq(conversations.id, response.conversationId));
    });
  });
});
