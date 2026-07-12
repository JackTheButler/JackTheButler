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
import { db, tasks, conversations, reservations, guests } from '@/db/index.js';
import { taskService } from '@/services/task.js';
import { conversationService } from '@/services/conversation.js';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';
import type {
  TaskCreatedEvent,
  TaskAssignedEvent,
  TaskCompletedEvent,
  ConversationCreatedEvent,
  ConversationEscalatedEvent,
  ConversationUpdatedEvent,
  ReservationCheckedInEvent,
  ReservationCheckedOutEvent,
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

async function insertTask(overrides: Partial<typeof tasks.$inferInsert> = {}) {
  const id = generateId('task');
  await db.insert(tasks).values({
    id,
    type: 'maintenance',
    department: 'engineering',
    description: 'Fix the AC',
    status: 'pending',
    priority: 'standard',
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });
  return id;
}

async function insertGuest(overrides: Partial<typeof guests.$inferInsert> = {}) {
  const id = generateId('guest');
  await db.insert(guests).values({
    id,
    firstName: 'Ada',
    lastName: 'Lovelace',
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });
  return id;
}

async function insertConversation(overrides: Partial<typeof conversations.$inferInsert> = {}) {
  const id = generateId('conversation');
  await db.insert(conversations).values({
    id,
    channelType: 'whatsapp',
    channelId: `chan_${id}`,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });
  return id;
}

async function insertReservation(guestId: string, overrides: Partial<typeof reservations.$inferInsert> = {}) {
  const id = generateId('reservation');
  await db.insert(reservations).values({
    id,
    guestId,
    confirmationNumber: `CNF-${id}`,
    roomType: 'Deluxe King',
    arrivalDate: '2026-08-01',
    departureDate: '2026-08-05',
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });
  return id;
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

  // ─────────────────────────────────────────────────────────────
  // Task created activity
  // ─────────────────────────────────────────────────────────────

  describe('task created activity', () => {
    it('broadcasts an activity item with room and priority detail for a non-standard priority task', async () => {
      const taskId = await insertTask({
        type: 'maintenance',
        priority: 'urgent',
        roomNumber: '204',
        department: 'engineering',
        description: 'AC broken',
      });

      events.emit({
        type: EventTypes.TASK_CREATED,
        timestamp: new Date(),
        taskId,
        type_: 'maintenance',
        department: 'engineering',
        priority: 'urgent',
      } as TaskCreatedEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `task-${taskId}`);
      expect(activity).toBeDefined();
      expect(activity!.payload).toMatchObject({
        id: `task-${taskId}`,
        type: 'task_created',
        text: 'Maintenance task created',
        detail: 'Room 204 · Urgent',
        data: { taskType: 'maintenance', priority: 'urgent', roomNumber: '204' },
      });
    });

    it('falls back to "New task" detail and omits priority/room from data for standard priority, no room', async () => {
      const taskId = await insertTask({ type: 'concierge', priority: 'standard', roomNumber: null });

      events.emit({
        type: EventTypes.TASK_CREATED,
        timestamp: new Date(),
        taskId,
        type_: 'concierge',
        department: 'front_desk',
        priority: 'standard',
      } as TaskCreatedEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `task-${taskId}`);
      expect(activity).toBeDefined();
      expect(activity!.payload).toMatchObject({
        text: 'Concierge task created',
        detail: 'New task',
        data: { taskType: 'concierge' },
      });
      expect((activity!.payload as { data: object }).data).not.toHaveProperty('priority');
      expect((activity!.payload as { data: object }).data).not.toHaveProperty('roomNumber');
    });

    it('replaces every underscore when building the label', async () => {
      const taskId = await insertTask({ type: 'a_b_c', priority: 'standard' });

      events.emit({
        type: EventTypes.TASK_CREATED,
        timestamp: new Date(),
        taskId,
        type_: 'a_b_c',
        department: 'ops',
        priority: 'standard',
      } as TaskCreatedEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `task-${taskId}`);
      expect(activity!.payload).toMatchObject({ text: 'A b c task created' });
    });

    it('does not broadcast an activity item when the task no longer exists', async () => {
      const taskId = generateId('task');
      events.emit({
        type: EventTypes.TASK_CREATED,
        timestamp: new Date(),
        taskId,
        type_: 'maintenance',
        department: 'engineering',
        priority: 'standard',
      } as TaskCreatedEvent);
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `task-${taskId}`)).toBe(false);
      // The independent stats listener still fires.
      expect(callsOfType('stats:tasks').length).toBeGreaterThanOrEqual(1);
    });

    it('does not throw and broadcasts nothing for this event when the DB query fails', async () => {
      vi.spyOn(db, 'select').mockImplementation(() => {
        throw new Error('db down');
      });

      const taskId = generateId('task');
      expect(() =>
        events.emit({
          type: EventTypes.TASK_CREATED,
          timestamp: new Date(),
          taskId,
          type_: 'maintenance',
          department: 'engineering',
          priority: 'standard',
        } as TaskCreatedEvent)
      ).not.toThrow();
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `task-${taskId}`)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Conversation escalated activity
  // ─────────────────────────────────────────────────────────────

  describe('conversation escalated activity', () => {
    it('broadcasts escalation activity with channel and intent', async () => {
      const conversationId = await insertConversation({ channelType: 'sms', currentIntent: 'room_service' });

      events.emit({
        type: EventTypes.CONVERSATION_ESCALATED,
        timestamp: new Date(),
        conversationId,
        reasons: ['angry guest'],
        priority: 'high',
      } as ConversationEscalatedEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `conv-esc-${conversationId}`);
      expect(activity).toBeDefined();
      expect(activity!.payload).toMatchObject({
        type: 'escalated',
        text: 'Conversation escalated to staff',
        detail: 'Sms · room_service',
        channel: 'sms',
        data: { intent: 'room_service' },
      });
    });

    it('falls back to "guest inquiry" and omits intent from data when currentIntent is null', async () => {
      const conversationId = await insertConversation({ channelType: 'email', currentIntent: null });

      events.emit({
        type: EventTypes.CONVERSATION_ESCALATED,
        timestamp: new Date(),
        conversationId,
        reasons: ['unclear'],
        priority: 'standard',
      } as ConversationEscalatedEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `conv-esc-${conversationId}`);
      expect(activity!.payload).toMatchObject({ detail: 'Email · guest inquiry' });
      expect((activity!.payload as { data: object }).data).toEqual({});
    });

    it('does not broadcast when the conversation no longer exists', async () => {
      const conversationId = generateId('conversation');
      events.emit({
        type: EventTypes.CONVERSATION_ESCALATED,
        timestamp: new Date(),
        conversationId,
        reasons: [],
        priority: 'standard',
      } as ConversationEscalatedEvent);
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `conv-esc-${conversationId}`)).toBe(false);
    });

    it('does not throw when the DB query fails', async () => {
      vi.spyOn(db, 'select').mockImplementation(() => {
        throw new Error('db down');
      });

      const conversationId = generateId('conversation');
      expect(() =>
        events.emit({
          type: EventTypes.CONVERSATION_ESCALATED,
          timestamp: new Date(),
          conversationId,
          reasons: [],
          priority: 'standard',
        } as ConversationEscalatedEvent)
      ).not.toThrow();
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `conv-esc-${conversationId}`)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Conversation resolved activity (via conversation.updated)
  // ─────────────────────────────────────────────────────────────

  describe('conversation resolved activity', () => {
    it('broadcasts ai_resolved activity when state changes to resolved', async () => {
      const conversationId = await insertConversation({ channelType: 'webchat', currentIntent: 'late_checkout' });

      events.emit({
        type: EventTypes.CONVERSATION_UPDATED,
        timestamp: new Date(),
        conversationId,
        changes: { state: 'resolved' },
      } as ConversationUpdatedEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `conv-res-${conversationId}`);
      expect(activity).toBeDefined();
      expect(activity!.payload).toMatchObject({
        type: 'ai_resolved',
        text: 'AI resolved late_checkout',
        detail: 'Webchat',
        channel: 'webchat',
        data: { intent: 'late_checkout' },
      });
    });

    it('falls back to "guest inquiry" and omits intent from data when currentIntent is null', async () => {
      const conversationId = await insertConversation({ channelType: 'sms', currentIntent: null });

      events.emit({
        type: EventTypes.CONVERSATION_UPDATED,
        timestamp: new Date(),
        conversationId,
        changes: { state: 'resolved' },
      } as ConversationUpdatedEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `conv-res-${conversationId}`);
      expect(activity!.payload).toMatchObject({ text: 'AI resolved guest inquiry' });
      expect((activity!.payload as { data: object }).data).toEqual({});
    });

    it('does not broadcast an ai_resolved activity for non-resolved state changes', async () => {
      const conversationId = await insertConversation({ channelType: 'webchat' });

      events.emit({
        type: EventTypes.CONVERSATION_UPDATED,
        timestamp: new Date(),
        conversationId,
        changes: { assignedTo: 'staff-1' },
      } as ConversationUpdatedEvent);
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `conv-res-${conversationId}`)).toBe(false);
      // The stats:conversations listener isn't gated on state, so it still fires.
      expect(callsOfType('stats:conversations').length).toBeGreaterThanOrEqual(1);
    });

    it('does not broadcast when the resolved conversation no longer exists', async () => {
      const conversationId = generateId('conversation');
      events.emit({
        type: EventTypes.CONVERSATION_UPDATED,
        timestamp: new Date(),
        conversationId,
        changes: { state: 'resolved' },
      } as ConversationUpdatedEvent);
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `conv-res-${conversationId}`)).toBe(false);
    });

    it('does not throw when the DB query fails', async () => {
      vi.spyOn(db, 'select').mockImplementation(() => {
        throw new Error('db down');
      });

      const conversationId = generateId('conversation');
      expect(() =>
        events.emit({
          type: EventTypes.CONVERSATION_UPDATED,
          timestamp: new Date(),
          conversationId,
          changes: { state: 'resolved' },
        } as ConversationUpdatedEvent)
      ).not.toThrow();
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `conv-res-${conversationId}`)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Reservation checked-in activity
  // ─────────────────────────────────────────────────────────────

  describe('reservation checked-in activity', () => {
    it('broadcasts checkin activity with room and room type detail', async () => {
      const guestId = await insertGuest({ firstName: 'Grace', lastName: 'Hopper' });
      const reservationId = await insertReservation(guestId, { roomType: 'Suite' });

      events.emit({
        type: EventTypes.RESERVATION_CHECKED_IN,
        timestamp: new Date(),
        reservationId,
        guestId,
        roomNumber: '501',
      } as ReservationCheckedInEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `res-in-${reservationId}`);
      expect(activity).toBeDefined();
      expect(activity!.payload).toMatchObject({
        type: 'checkin',
        text: 'Grace Hopper checked in',
        detail: 'Room 501 · Suite',
        data: { guestName: 'Grace Hopper', roomNumber: '501', roomType: 'Suite' },
      });
    });

    it('treats "unknown" room type (case-insensitive) as absent', async () => {
      const guestId = await insertGuest({ firstName: 'Alan', lastName: 'Turing' });
      const reservationId = await insertReservation(guestId, { roomType: 'Unknown' });

      events.emit({
        type: EventTypes.RESERVATION_CHECKED_IN,
        timestamp: new Date(),
        reservationId,
        guestId,
        roomNumber: '',
      } as ReservationCheckedInEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `res-in-${reservationId}`);
      expect(activity!.payload).toMatchObject({ detail: 'Guest stay' });
      expect((activity!.payload as { data: object }).data).toEqual({ guestName: 'Alan Turing' });
    });

    it('drops a whitespace-only room type from both detail and data', async () => {
      const guestId = await insertGuest({ firstName: 'Katherine', lastName: 'Johnson' });
      const reservationId = await insertReservation(guestId, { roomType: '   ' });

      events.emit({
        type: EventTypes.RESERVATION_CHECKED_IN,
        timestamp: new Date(),
        reservationId,
        guestId,
        roomNumber: '',
      } as ReservationCheckedInEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `res-in-${reservationId}`);
      expect(activity!.payload).toMatchObject({ detail: 'Guest stay' });
      expect((activity!.payload as { data: object }).data).toEqual({ guestName: 'Katherine Johnson' });
    });

    it('trims a padded room type in both detail and data', async () => {
      const guestId = await insertGuest({ firstName: 'Dorothy', lastName: 'Vaughan' });
      const reservationId = await insertReservation(guestId, { roomType: '  Deluxe King  ' });

      events.emit({
        type: EventTypes.RESERVATION_CHECKED_IN,
        timestamp: new Date(),
        reservationId,
        guestId,
        roomNumber: '',
      } as ReservationCheckedInEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `res-in-${reservationId}`);
      expect(activity!.payload).toMatchObject({ detail: 'Deluxe King' });
      expect((activity!.payload as { data: object }).data).toEqual({
        guestName: 'Dorothy Vaughan',
        roomType: 'Deluxe King',
      });
    });

    it('does not broadcast when the guest no longer exists', async () => {
      const reservationId = generateId('reservation');
      events.emit({
        type: EventTypes.RESERVATION_CHECKED_IN,
        timestamp: new Date(),
        reservationId,
        guestId: generateId('guest'),
        roomNumber: '100',
      } as ReservationCheckedInEvent);
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `res-in-${reservationId}`)).toBe(false);
    });

    it('does not throw when the DB query fails', async () => {
      vi.spyOn(db, 'select').mockImplementation(() => {
        throw new Error('db down');
      });

      const reservationId = generateId('reservation');
      expect(() =>
        events.emit({
          type: EventTypes.RESERVATION_CHECKED_IN,
          timestamp: new Date(),
          reservationId,
          guestId: generateId('guest'),
          roomNumber: '100',
        } as ReservationCheckedInEvent)
      ).not.toThrow();
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `res-in-${reservationId}`)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Reservation checked-out activity
  // ─────────────────────────────────────────────────────────────

  describe('reservation checked-out activity', () => {
    it('broadcasts checkout activity with room number detail', async () => {
      const guestId = await insertGuest({ firstName: 'Marie', lastName: 'Curie' });
      const reservationId = generateId('reservation');

      events.emit({
        type: EventTypes.RESERVATION_CHECKED_OUT,
        timestamp: new Date(),
        reservationId,
        guestId,
        roomNumber: '302',
      } as ReservationCheckedOutEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `res-out-${reservationId}`);
      expect(activity).toBeDefined();
      expect(activity!.payload).toMatchObject({
        type: 'checkout',
        text: 'Marie Curie checked out',
        detail: 'Room 302',
        data: { guestName: 'Marie Curie', roomNumber: '302' },
      });
    });

    it('falls back to "Guest stay" detail when there is no room number', async () => {
      const guestId = await insertGuest({ firstName: 'Rosalind', lastName: 'Franklin' });
      const reservationId = generateId('reservation');

      events.emit({
        type: EventTypes.RESERVATION_CHECKED_OUT,
        timestamp: new Date(),
        reservationId,
        guestId,
        roomNumber: '',
      } as ReservationCheckedOutEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `res-out-${reservationId}`);
      expect(activity!.payload).toMatchObject({ detail: 'Guest stay' });
    });

    it('does not broadcast when the guest no longer exists', async () => {
      const reservationId = generateId('reservation');
      events.emit({
        type: EventTypes.RESERVATION_CHECKED_OUT,
        timestamp: new Date(),
        reservationId,
        guestId: generateId('guest'),
        roomNumber: '100',
      } as ReservationCheckedOutEvent);
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `res-out-${reservationId}`)).toBe(false);
    });

    it('does not throw when the DB query fails', async () => {
      vi.spyOn(db, 'select').mockImplementation(() => {
        throw new Error('db down');
      });

      const reservationId = generateId('reservation');
      expect(() =>
        events.emit({
          type: EventTypes.RESERVATION_CHECKED_OUT,
          timestamp: new Date(),
          reservationId,
          guestId: generateId('guest'),
          roomNumber: '100',
        } as ReservationCheckedOutEvent)
      ).not.toThrow();
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `res-out-${reservationId}`)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // AI reply activity (message.sent)
  // ─────────────────────────────────────────────────────────────

  describe('ai reply activity', () => {
    it('broadcasts ai_reply activity for AI-sent messages', async () => {
      const messageId = generateId('message');
      events.emit({
        type: EventTypes.MESSAGE_SENT,
        timestamp: new Date(),
        conversationId: generateId('conversation'),
        messageId,
        content: 'Sure, I can help with that!',
        senderType: 'ai',
        channel: 'whatsapp',
      } as MessageSentEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `msg-${messageId}`);
      expect(activity).toBeDefined();
      expect(activity!.payload).toMatchObject({
        type: 'ai_reply',
        text: 'AI replied to guest',
        detail: 'Whatsapp · "Sure, I can help with that!"',
        channel: 'whatsapp',
        data: { snippet: 'Sure, I can help with that!' },
      });
    });

    it('truncates long content to 60 characters with an ellipsis', async () => {
      const messageId = generateId('message');
      const longContent = 'x'.repeat(80);
      events.emit({
        type: EventTypes.MESSAGE_SENT,
        timestamp: new Date(),
        conversationId: generateId('conversation'),
        messageId,
        content: longContent,
        senderType: 'ai',
        channel: 'email',
      } as MessageSentEvent);
      await flush();

      const activity = callsOfType('activity:event').find((c) => (c.payload as { id: string }).id === `msg-${messageId}`);
      const expectedSnippet = 'x'.repeat(60) + '…';
      expect((activity!.payload as { data: { snippet: string } }).data.snippet).toBe(expectedSnippet);
    });

    it('does not broadcast ai_reply activity for non-AI senders', async () => {
      const messageId = generateId('message');
      events.emit({
        type: EventTypes.MESSAGE_SENT,
        timestamp: new Date(),
        conversationId: generateId('conversation'),
        messageId,
        content: 'On my way!',
        senderType: 'staff',
        channel: 'sms',
      } as MessageSentEvent);
      await flush();

      expect(callsOfType('activity:event').some((c) => (c.payload as { id: string }).id === `msg-${messageId}`)).toBe(false);
    });
  });
});
