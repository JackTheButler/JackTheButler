/**
 * WebSocket Event Bridge Tests
 *
 * The bridge subscribes domain events to WebSocket broadcasts. The real
 * `broadcast()` function writes to an in-module `clients` Map in
 * `@/gateway/websocket.js` that is private and always empty in tests (no real
 * socket ever connects), so we mock that module and assert on the payloads
 * the bridge hands to `broadcast()` instead of spinning up real sockets.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('@/gateway/websocket.js', () => ({
  broadcast: vi.fn(),
}));

import { broadcast } from '@/gateway/websocket.js';
import { setupWebSocketBridge } from '@/gateway/websocket-bridge.js';
import { events, EventTypes } from '@/events/index.js';
import { taskService } from '@/services/task.js';
import { conversationService } from '@/services/conversation.js';
import { generateId } from '@/utils/id.js';
import type {
  TaskCreatedEvent,
  TaskAssignedEvent,
  TaskCompletedEvent,
  ConversationCreatedEvent,
  MessageSentEvent,
  MessageReceivedEvent,
  ModelDownloadProgressEvent,
} from '@/types/events.js';

const broadcastMock = vi.mocked(broadcast);

/** Give fire-and-forget async event listeners a chance to finish their DB work. */
function flush(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function callsOfType(type: string) {
  return broadcastMock.mock.calls.map((c) => c[0]).filter((m) => (m as { type: string }).type === type);
}

describe('websocket-bridge', () => {
  beforeAll(() => {
    setupWebSocketBridge();
  });

  beforeEach(() => {
    broadcastMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // Task stats
  // ─────────────────────────────────────────────────────────────

  describe('task stats broadcasts', () => {
    it.each([
      ['task.created', EventTypes.TASK_CREATED],
      ['task.assigned', EventTypes.TASK_ASSIGNED],
      ['task.completed', EventTypes.TASK_COMPLETED],
    ])('broadcasts stats:tasks on %s', async (_label, type) => {
      const taskId = generateId('task');
      events.emit({
        type,
        timestamp: new Date(),
        taskId,
        assignedTo: 'staff-1',
      } as unknown as TaskAssignedEvent | TaskCompletedEvent);
      await flush();

      const statsCalls = callsOfType('stats:tasks');
      expect(statsCalls.length).toBeGreaterThanOrEqual(1);
      expect(statsCalls[0]).toMatchObject({
        payload: {
          pending: expect.any(Number),
          inProgress: expect.any(Number),
          completed: expect.any(Number),
          total: expect.any(Number),
        },
      });
    });

    it('does not broadcast stats:tasks when taskService.getStats rejects', async () => {
      vi.spyOn(taskService, 'getStats').mockRejectedValueOnce(new Error('db down'));

      events.emit({
        type: EventTypes.TASK_CREATED,
        timestamp: new Date(),
        taskId: generateId('task'),
        type_: 'maintenance',
        department: 'engineering',
        priority: 'standard',
      } as TaskCreatedEvent);
      await flush();

      expect(callsOfType('stats:tasks')).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Conversation stats
  // ─────────────────────────────────────────────────────────────

  describe('conversation stats broadcasts', () => {
    it('broadcasts stats:conversations on conversation.created', async () => {
      events.emit({
        type: EventTypes.CONVERSATION_CREATED,
        timestamp: new Date(),
        conversationId: generateId('conversation'),
        channel: 'webchat',
        channelId: 'chan-1',
      } as ConversationCreatedEvent);
      await flush();

      const statsCalls = callsOfType('stats:conversations');
      expect(statsCalls.length).toBeGreaterThanOrEqual(1);
      expect(statsCalls[0]).toMatchObject({
        payload: {
          new: expect.any(Number),
          active: expect.any(Number),
          escalated: expect.any(Number),
          resolved: expect.any(Number),
          needsAttention: expect.any(Number),
        },
      });
    });

    it('does not broadcast stats:conversations when conversationService.getStats rejects', async () => {
      vi.spyOn(conversationService, 'getStats').mockRejectedValueOnce(new Error('db down'));

      events.emit({
        type: EventTypes.CONVERSATION_CREATED,
        timestamp: new Date(),
        conversationId: generateId('conversation'),
        channel: 'webchat',
        channelId: 'chan-2',
      } as ConversationCreatedEvent);
      await flush();

      expect(callsOfType('stats:conversations')).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // New message broadcast
  // ─────────────────────────────────────────────────────────────

  describe('conversation:message broadcast', () => {
    it('broadcasts conversation:message on message.saved with a conversationId', async () => {
      const conversationId = generateId('conversation');
      events.emit({
        type: EventTypes.MESSAGE_RECEIVED,
        timestamp: new Date(),
        conversationId,
        messageId: generateId('message'),
        channel: 'webchat',
        content: 'hello',
        contentType: 'text',
      } as MessageReceivedEvent);
      await flush();

      const calls = callsOfType('conversation:message');
      expect(calls).toContainEqual({ type: 'conversation:message', payload: { conversationId } });
    });

    it('broadcasts conversation:message on message.sent with a conversationId', async () => {
      const conversationId = generateId('conversation');
      events.emit({
        type: EventTypes.MESSAGE_SENT,
        timestamp: new Date(),
        conversationId,
        messageId: generateId('message'),
        content: 'hi there',
        senderType: 'staff',
        channel: 'sms',
      } as MessageSentEvent);
      await flush();

      const calls = callsOfType('conversation:message');
      expect(calls).toContainEqual({ type: 'conversation:message', payload: { conversationId } });
    });

    it('does not broadcast conversation:message when conversationId is missing', async () => {
      events.emit({
        type: EventTypes.MESSAGE_RECEIVED,
        timestamp: new Date(),
        messageId: generateId('message'),
        channel: 'webchat',
        content: 'hello',
        contentType: 'text',
      } as unknown as MessageReceivedEvent);
      await flush();

      expect(callsOfType('conversation:message')).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Model download progress
  // ─────────────────────────────────────────────────────────────

  describe('model download progress broadcast', () => {
    it('broadcasts model:download:progress with the raw event payload', async () => {
      const payload = { model: 'all-MiniLM-L6-v2', status: 'progress' as const, progress: 42 };
      events.emit({
        type: EventTypes.MODEL_DOWNLOAD_PROGRESS,
        timestamp: new Date(),
        payload,
      } as ModelDownloadProgressEvent);
      await flush();

      expect(broadcastMock).toHaveBeenCalledWith({ type: 'model:download:progress', payload });
    });
  });
});
