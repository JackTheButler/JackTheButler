/**
 * Conversation Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationService } from '@/services/conversation.js';
import { db, conversations, messages } from '@/db/index.js';
import { eq } from 'drizzle-orm';

describe('ConversationService', () => {
  let service: ConversationService;
  const testPrefix = `svc-${Date.now()}`;

  beforeEach(() => {
    service = new ConversationService();
  });

  describe('findOrCreate', () => {
    it('should create a new conversation', async () => {
      const channelId = `${testPrefix}-session-1`;
      const conv = await service.findOrCreate('webchat', channelId);

      expect(conv.id).toBeDefined();
      expect(conv.channelType).toBe('webchat');
      expect(conv.channelId).toBe(channelId);
      expect(conv.state).toBe('active');

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });

    it('should return existing active conversation', async () => {
      const channelId = `${testPrefix}-session-2`;
      const conv1 = await service.findOrCreate('webchat', channelId);
      const conv2 = await service.findOrCreate('webchat', channelId);

      expect(conv1.id).toBe(conv2.id);

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, conv1.id));
    });

    it('should create new conversation for different channelId', async () => {
      const channelId1 = `${testPrefix}-session-3`;
      const channelId2 = `${testPrefix}-session-4`;

      const conv1 = await service.findOrCreate('webchat', channelId1);
      const conv2 = await service.findOrCreate('webchat', channelId2);

      expect(conv1.id).not.toBe(conv2.id);

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, conv1.id));
      await db.delete(conversations).where(eq(conversations.id, conv2.id));
    });
  });

  describe('findById', () => {
    it('should return conversation by ID', async () => {
      const channelId = `${testPrefix}-session-5`;
      const created = await service.findOrCreate('webchat', channelId);
      const found = await service.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, created.id));
    });

    it('should return null for non-existent ID', async () => {
      const found = await service.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('getById', () => {
    it('should return conversation by ID', async () => {
      const channelId = `${testPrefix}-session-6`;
      const created = await service.findOrCreate('webchat', channelId);
      const found = await service.getById(created.id);

      expect(found.id).toBe(created.id);

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, created.id));
    });

    it('should throw NotFoundError for non-existent ID', async () => {
      await expect(service.getById('non-existent-id')).rejects.toThrow('not found');
    });
  });

  describe('list', () => {
    it('should return conversations', async () => {
      const channelId1 = `${testPrefix}-list-1`;
      const channelId2 = `${testPrefix}-list-2`;

      const conv1 = await service.findOrCreate('webchat', channelId1);
      const conv2 = await service.findOrCreate('webchat', channelId2);

      const list = await service.list();

      // Should include our test conversations
      const testConvs = list.filter(c =>
        c.channelId === channelId1 || c.channelId === channelId2
      );
      expect(testConvs.length).toBe(2);

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, conv1.id));
      await db.delete(conversations).where(eq(conversations.id, conv2.id));
    });

    it('should filter by state', async () => {
      const channelId = `${testPrefix}-state-1`;
      const conv = await service.findOrCreate('webchat', channelId);
      await service.update(conv.id, { state: 'resolved' });

      const activeList = await service.list({ state: 'active' });
      const resolvedList = await service.list({ state: 'resolved' });

      expect(activeList.find((c) => c.id === conv.id)).toBeUndefined();
      expect(resolvedList.find((c) => c.id === conv.id)).toBeDefined();

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });
  });

  describe('update', () => {
    it('should update conversation state', async () => {
      const channelId = `${testPrefix}-update-1`;
      const conv = await service.findOrCreate('webchat', channelId);
      const updated = await service.update(conv.id, { state: 'escalated' });

      expect(updated.state).toBe('escalated');

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });

    it('should set resolvedAt when state is resolved', async () => {
      const channelId = `${testPrefix}-update-2`;
      const conv = await service.findOrCreate('webchat', channelId);
      const updated = await service.update(conv.id, { state: 'resolved' });

      expect(updated.resolvedAt).toBeDefined();

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });

    it('should update currentIntent', async () => {
      const channelId = `${testPrefix}-update-3`;
      const conv = await service.findOrCreate('webchat', channelId);
      const updated = await service.update(conv.id, { currentIntent: 'room_service' });

      expect(updated.currentIntent).toBe('room_service');

      // Cleanup
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });
  });

  describe('addMessage', () => {
    it('should add a message to conversation', async () => {
      const channelId = `${testPrefix}-msg-1`;
      const conv = await service.findOrCreate('webchat', channelId);

      const message = await service.addMessage(conv.id, {
        direction: 'inbound',
        senderType: 'guest',
        content: 'Hello',
        contentType: 'text',
      });

      expect(message.id).toBeDefined();
      expect(message.content).toBe('Hello');
      expect(message.conversationId).toBe(conv.id);

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });

    it('should update conversation lastMessageAt', async () => {
      const channelId = `${testPrefix}-msg-2`;
      const conv = await service.findOrCreate('webchat', channelId);

      await service.addMessage(conv.id, {
        direction: 'inbound',
        senderType: 'guest',
        content: 'Update timestamp',
        contentType: 'text',
      });

      const updated = await service.getById(conv.id);
      expect(updated.lastMessageAt).toBeDefined();

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });
  });

  describe('getMessages', () => {
    it('should return messages in chronological order', async () => {
      const channelId = `${testPrefix}-get-msgs-1`;
      const conv = await service.findOrCreate('webchat', channelId);

      await service.addMessage(conv.id, {
        direction: 'inbound',
        senderType: 'guest',
        content: 'First',
        contentType: 'text',
      });

      await service.addMessage(conv.id, {
        direction: 'outbound',
        senderType: 'ai',
        content: 'Second',
        contentType: 'text',
      });

      const msgs = await service.getMessages(conv.id);

      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe('First');
      expect(msgs[1].content).toBe('Second');

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });

    it('should respect limit option', async () => {
      const channelId = `${testPrefix}-get-msgs-2`;
      const conv = await service.findOrCreate('webchat', channelId);

      for (let i = 0; i < 5; i++) {
        await service.addMessage(conv.id, {
          direction: 'inbound',
          senderType: 'guest',
          content: `Message ${i}`,
          contentType: 'text',
        });
      }

      const msgs = await service.getMessages(conv.id, { limit: 3 });
      expect(msgs).toHaveLength(3);

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });
  });

  describe('getDetails', () => {
    it('should return full conversation details', async () => {
      const channelId = `${testPrefix}-details-1`;
      const conv = await service.findOrCreate('webchat', channelId);

      await service.addMessage(conv.id, {
        direction: 'inbound',
        senderType: 'guest',
        content: 'Test',
        contentType: 'text',
      });

      const details = await service.getDetails(conv.id);

      expect(details.id).toBe(conv.id);
      expect(details.messageCount).toBe(1);
      expect(details.metadata).toBeDefined();

      // Cleanup
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
      await db.delete(conversations).where(eq(conversations.id, conv.id));
    });
  });
});
