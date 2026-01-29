/**
 * Conversation Routes Tests
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, conversations, messages, tasks, approvalQueue } from '@/db/index.js';
import { eq } from 'drizzle-orm';

describe('Conversation Routes', () => {
  let accessToken: string;

  // Ensure test user exists and get token
  beforeAll(async () => {
    const existing = await db.select().from(staff).where(eq(staff.email, 'test@hotel.com')).limit(1);
    if (existing.length === 0) {
      await db.insert(staff).values({
        id: 'staff-test-001',
        email: 'test@hotel.com',
        name: 'Test User',
        role: 'admin',
        department: 'testing',
        permissions: JSON.stringify(['*']),
        status: 'active',
        passwordHash: 'test123',
      });
    }

    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@hotel.com', password: 'test123' }),
    });
    const { accessToken: token } = await loginRes.json();
    accessToken = token;
  });

  // Clean up before each test to ensure isolation
  // Must delete from child tables first due to foreign key constraints
  beforeEach(async () => {
    await db.delete(messages);
    await db.delete(tasks);
    await db.delete(approvalQueue);
    await db.delete(conversations);
  });

  afterEach(async () => {
    // Clean up test conversations
    // Must delete from child tables first due to foreign key constraints
    await db.delete(messages);
    await db.delete(tasks);
    await db.delete(approvalQueue);
    await db.delete(conversations);
  });

  describe('GET /api/v1/conversations', () => {
    it('should return empty list initially', async () => {
      const res = await app.request('/api/v1/conversations', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.conversations).toEqual([]);
    });

    it('should return conversations', async () => {
      // Create a test conversation
      await db.insert(conversations).values({
        id: 'conv-test-001',
        channelType: 'webchat',
        channelId: 'session-test',
        state: 'active',
        metadata: '{}',
      });

      const res = await app.request('/api/v1/conversations', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.conversations).toHaveLength(1);
      expect(json.conversations[0].id).toBe('conv-test-001');
    });

    it('should require authentication', async () => {
      const res = await app.request('/api/v1/conversations');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/conversations/:id', () => {
    it('should return conversation details', async () => {
      await db.insert(conversations).values({
        id: 'conv-test-002',
        channelType: 'webchat',
        channelId: 'session-test-2',
        state: 'active',
        metadata: '{}',
      });

      const res = await app.request('/api/v1/conversations/conv-test-002', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.conversation.id).toBe('conv-test-002');
      expect(json.conversation.channelType).toBe('webchat');
    });

    it('should return 404 for non-existent conversation', async () => {
      const res = await app.request('/api/v1/conversations/non-existent', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/conversations/:id', () => {
    it('should update conversation state', async () => {
      await db.insert(conversations).values({
        id: 'conv-test-003',
        channelType: 'webchat',
        channelId: 'session-test-3',
        state: 'active',
        metadata: '{}',
      });

      const res = await app.request('/api/v1/conversations/conv-test-003', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'resolved' }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.conversation.state).toBe('resolved');
    });
  });

  describe('GET /api/v1/conversations/:id/messages', () => {
    it('should return messages for conversation', async () => {
      await db.insert(conversations).values({
        id: 'conv-test-004',
        channelType: 'webchat',
        channelId: 'session-test-4',
        state: 'active',
        metadata: '{}',
      });

      await db.insert(messages).values([
        {
          id: 'msg-test-001',
          conversationId: 'conv-test-004',
          direction: 'inbound',
          senderType: 'guest',
          content: 'Hello',
          contentType: 'text',
        },
        {
          id: 'msg-test-002',
          conversationId: 'conv-test-004',
          direction: 'outbound',
          senderType: 'ai',
          content: 'Hi there!',
          contentType: 'text',
        },
      ]);

      const res = await app.request('/api/v1/conversations/conv-test-004/messages', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.messages).toHaveLength(2);
    });
  });

  describe('POST /api/v1/conversations/:id/messages', () => {
    it('should add staff message to conversation', async () => {
      await db.insert(conversations).values({
        id: 'conv-test-005',
        channelType: 'webchat',
        channelId: 'session-test-5',
        state: 'active',
        metadata: '{}',
      });

      const res = await app.request('/api/v1/conversations/conv-test-005/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'How can I help you?',
          contentType: 'text',
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.message.content).toBe('How can I help you?');
      expect(json.message.senderType).toBe('staff');
    });
  });
});
