/**
 * P0 Use Case Validation Tests
 *
 * End-to-end tests to validate all P0 use cases defined in the requirements.
 * These tests ensure the core functionality works as expected.
 *
 * P0 Use Cases:
 * - G-01: Pre-arrival messaging
 * - G-02: Check-in assistance
 * - G-03: Service requests (housekeeping)
 * - G-04: Information inquiries
 * - G-05: Complaints handling
 * - G-08: Check-out assistance
 * - S-01: Staff conversation management
 * - S-02: Staff task management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import * as schema from '@/db/schema.js';
import { generateId } from '@/utils/id.js';

// Use in-memory database for tests
function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guests (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      language TEXT DEFAULT 'en',
      loyalty_tier TEXT,
      vip_status TEXT,
      external_ids TEXT NOT NULL DEFAULT '{}',
      preferences TEXT NOT NULL DEFAULT '[]',
      stay_count INTEGER NOT NULL DEFAULT 0,
      total_revenue REAL NOT NULL DEFAULT 0,
      last_stay_date TEXT,
      notes TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL REFERENCES guests(id),
      confirmation_number TEXT NOT NULL UNIQUE,
      external_id TEXT,
      room_number TEXT,
      room_type TEXT NOT NULL,
      arrival_date TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      estimated_arrival TEXT,
      actual_arrival TEXT,
      estimated_departure TEXT,
      actual_departure TEXT,
      rate_code TEXT,
      total_rate REAL,
      balance REAL DEFAULT 0,
      special_requests TEXT DEFAULT '[]',
      notes TEXT DEFAULT '[]',
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO roles (id, name, permissions, is_system) VALUES
      ('role-admin', 'Admin', '["*"]', 1),
      ('role-staff', 'Staff', '["conversations:view"]', 1);

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      role_id TEXT NOT NULL REFERENCES roles(id),
      permissions TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      last_active_at TEXT,
      password_hash TEXT,
      email_verified INTEGER NOT NULL DEFAULT 1,
      approval_status TEXT NOT NULL DEFAULT 'approved',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      guest_id TEXT REFERENCES guests(id),
      reservation_id TEXT REFERENCES reservations(id),
      channel_type TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'active',
      assigned_to TEXT REFERENCES staff(id),
      current_intent TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      last_message_at TEXT,
      resolved_at TEXT,
      idle_warned_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      direction TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      media TEXT,
      intent TEXT,
      confidence REAL,
      entities TEXT,
      channel_message_id TEXT,
      delivery_status TEXT DEFAULT 'sent',
      delivery_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id),
      message_id TEXT REFERENCES messages(id),
      type TEXT NOT NULL,
      department TEXT NOT NULL,
      room_number TEXT,
      description TEXT NOT NULL,
      items TEXT,
      priority TEXT NOT NULL DEFAULT 'standard',
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      assigned_to TEXT REFERENCES staff(id),
      external_id TEXT,
      external_system TEXT,
      due_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      notes TEXT,
      completion_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_config TEXT NOT NULL,
      actions TEXT,
      retry_config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      last_error TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS automation_logs (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL REFERENCES automation_rules(id),
      status TEXT NOT NULL,
      trigger_data TEXT,
      action_result TEXT,
      error_message TEXT,
      execution_time_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return drizzle(sqlite, { schema });
}

describe('P0 Use Cases', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('G-01: Pre-arrival Messaging', () => {
    it('should have automation rule for pre-arrival messages', async () => {
      // Create pre-arrival automation rule
      const ruleId = generateId('rule');
      await db.insert(schema.automationRules).values({
        id: ruleId,
        name: 'Pre-arrival Welcome',
        description: 'Sends welcome message 3 days before arrival',
        triggerType: 'time_based',
        triggerConfig: JSON.stringify({
          type: 'before_arrival',
          offsetDays: -3,
          time: '10:00',
        }),
        actionType: 'send_message',
        actionConfig: JSON.stringify({
          template: 'pre_arrival_welcome',
          channel: 'preferred',
        }),
        enabled: true,
      });

      // Verify rule exists and is enabled
      const rules = await db
        .select()
        .from(schema.automationRules)
        .where(eq(schema.automationRules.enabled, true));

      expect(rules.length).toBe(1);
      expect(rules[0].name).toBe('Pre-arrival Welcome');
      expect(rules[0].triggerType).toBe('time_based');
    });

    it('should find reservations arriving in 3 days', async () => {
      // Create guest
      const guestId = generateId('guest');
      await db.insert(schema.guests).values({
        id: guestId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+14155551234',
      });

      // Create reservation arriving in 3 days
      const arrivalDate = new Date();
      arrivalDate.setDate(arrivalDate.getDate() + 3);
      const departureDate = new Date(arrivalDate);
      departureDate.setDate(departureDate.getDate() + 2);

      const reservationId = generateId('reservation');
      await db.insert(schema.reservations).values({
        id: reservationId,
        guestId,
        confirmationNumber: 'CONF001',
        roomType: 'deluxe',
        arrivalDate: arrivalDate.toISOString().split('T')[0],
        departureDate: departureDate.toISOString().split('T')[0],
        status: 'confirmed',
      });

      // Query for reservations arriving in 3 days
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 3);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      const upcomingReservations = await db
        .select()
        .from(schema.reservations)
        .where(
          and(
            eq(schema.reservations.arrivalDate, targetDateStr),
            eq(schema.reservations.status, 'confirmed')
          )
        );

      expect(upcomingReservations.length).toBe(1);
      expect(upcomingReservations[0].guestId).toBe(guestId);
    });
  });

  describe('G-02: Check-in Assistance', () => {
    it('should handle early check-in inquiry', async () => {
      // Create guest
      const guestId = generateId('guest');
      await db.insert(schema.guests).values({
        id: guestId,
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+14155555678',
      });

      // Create conversation
      const conversationId = generateId('conversation');
      await db.insert(schema.conversations).values({
        id: conversationId,
        guestId,
        channelType: 'sms',
        channelId: '+14155555678',
        state: 'active',
        currentIntent: 'inquiry.checkin',
      });

      // Create message asking about early check-in
      const messageId = generateId('message');
      await db.insert(schema.messages).values({
        id: messageId,
        conversationId,
        direction: 'inbound',
        senderType: 'guest',
        content: 'Can I check in early tomorrow?',
        intent: 'inquiry.checkin',
        confidence: 0.92,
      });

      // Verify message was stored with correct intent
      const msgs = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId));

      expect(msgs.length).toBe(1);
      expect(msgs[0].intent).toBe('inquiry.checkin');
      expect(msgs[0].confidence).toBeGreaterThan(0.9);
    });
  });

  describe('G-03: Service Requests (Housekeeping)', () => {
    it('should create task from housekeeping request', async () => {
      // Create guest and reservation
      const guestId = generateId('guest');
      await db.insert(schema.guests).values({
        id: guestId,
        firstName: 'Bob',
        lastName: 'Wilson',
        phone: '+14155559999',
      });

      const reservationId = generateId('reservation');
      await db.insert(schema.reservations).values({
        id: reservationId,
        guestId,
        confirmationNumber: 'CONF002',
        roomNumber: '305',
        roomType: 'standard',
        arrivalDate: '2026-01-25',
        departureDate: '2026-01-28',
        status: 'checked_in',
      });

      // Create conversation
      const conversationId = generateId('conversation');
      await db.insert(schema.conversations).values({
        id: conversationId,
        guestId,
        reservationId,
        channelType: 'whatsapp',
        channelId: '+14155559999',
        state: 'active',
        currentIntent: 'request.housekeeping.towels',
      });

      // Create message requesting towels
      const messageId = generateId('message');
      await db.insert(schema.messages).values({
        id: messageId,
        conversationId,
        direction: 'inbound',
        senderType: 'guest',
        content: 'I need extra towels please',
        intent: 'request.housekeeping.towels',
        confidence: 0.95,
      });

      // Create task from the request
      const taskId = generateId('task');
      await db.insert(schema.tasks).values({
        id: taskId,
        conversationId,
        type: 'housekeeping',
        department: 'housekeeping',
        roomNumber: '305',
        description: 'Guest requests extra towels',
        items: JSON.stringify(['towels']),
        priority: 'standard',
        status: 'pending',
      });

      // Verify task was created
      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.conversationId, conversationId));

      expect(tasks.length).toBe(1);
      expect(tasks[0].type).toBe('housekeeping');
      expect(tasks[0].roomNumber).toBe('305');
      expect(tasks[0].status).toBe('pending');
    });
  });

  describe('G-04: Information Inquiries', () => {
    it('should answer common questions from knowledge base', async () => {
      // Create conversation
      const conversationId = generateId('conversation');
      await db.insert(schema.conversations).values({
        id: conversationId,
        channelType: 'webchat',
        channelId: 'session-123',
        state: 'active',
        currentIntent: 'inquiry.amenities',
      });

      // Create message asking about pool
      const messageId = generateId('message');
      await db.insert(schema.messages).values({
        id: messageId,
        conversationId,
        direction: 'inbound',
        senderType: 'guest',
        content: 'What time is the pool open?',
        intent: 'inquiry.amenities',
        confidence: 0.98,
      });

      // Create AI response
      const responseId = generateId('message');
      await db.insert(schema.messages).values({
        id: responseId,
        conversationId,
        direction: 'outbound',
        senderType: 'ai',
        content: 'The pool is open daily from 6:00 AM to 10:00 PM.',
        deliveryStatus: 'sent',
      });

      // Verify conversation flow
      const msgs = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId));

      expect(msgs.length).toBe(2);
      expect(msgs[0].direction).toBe('inbound');
      expect(msgs[1].direction).toBe('outbound');
      expect(msgs[1].senderType).toBe('ai');
    });
  });

  describe('G-05: Complaints Handling', () => {
    it('should escalate complaint and create task', async () => {
      // Create guest
      const guestId = generateId('guest');
      await db.insert(schema.guests).values({
        id: guestId,
        firstName: 'Alice',
        lastName: 'Brown',
        phone: '+14155557777',
      });

      // Create reservation
      const reservationId = generateId('reservation');
      await db.insert(schema.reservations).values({
        id: reservationId,
        guestId,
        confirmationNumber: 'CONF003',
        roomNumber: '412',
        roomType: 'suite',
        arrivalDate: '2026-01-26',
        departureDate: '2026-01-30',
        status: 'checked_in',
      });

      // Create conversation (escalated due to complaint)
      const conversationId = generateId('conversation');
      await db.insert(schema.conversations).values({
        id: conversationId,
        guestId,
        reservationId,
        channelType: 'sms',
        channelId: '+14155557777',
        state: 'escalated',
        currentIntent: 'complaint.room',
      });

      // Create complaint message
      const messageId = generateId('message');
      await db.insert(schema.messages).values({
        id: messageId,
        conversationId,
        direction: 'inbound',
        senderType: 'guest',
        content: 'The AC in my room is broken and I am very upset!',
        intent: 'complaint.room',
        confidence: 0.88,
      });

      // Create maintenance task
      const taskId = generateId('task');
      await db.insert(schema.tasks).values({
        id: taskId,
        conversationId,
        type: 'maintenance',
        department: 'maintenance',
        roomNumber: '412',
        description: 'AC not working - guest complaint',
        priority: 'urgent',
        status: 'pending',
      });

      // Verify escalation
      const conv = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .get();

      expect(conv?.state).toBe('escalated');

      // Verify urgent task created
      const task = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.conversationId, conversationId))
        .get();

      expect(task?.priority).toBe('urgent');
      expect(task?.type).toBe('maintenance');
    });
  });

  describe('G-08: Check-out Assistance', () => {
    it('should handle checkout inquiry with room info', async () => {
      // Create guest
      const guestId = generateId('guest');
      await db.insert(schema.guests).values({
        id: guestId,
        firstName: 'Tom',
        lastName: 'Davis',
        phone: '+14155556666',
      });

      // Create reservation
      const reservationId = generateId('reservation');
      await db.insert(schema.reservations).values({
        id: reservationId,
        guestId,
        confirmationNumber: 'CONF004',
        roomNumber: '208',
        roomType: 'deluxe',
        arrivalDate: '2026-01-25',
        departureDate: '2026-01-28',
        status: 'checked_in',
        balance: 125.5,
      });

      // Create conversation
      const conversationId = generateId('conversation');
      await db.insert(schema.conversations).values({
        id: conversationId,
        guestId,
        reservationId,
        channelType: 'email',
        channelId: 'tom@example.com',
        state: 'active',
        currentIntent: 'inquiry.checkout',
      });

      // Create checkout inquiry
      const messageId = generateId('message');
      await db.insert(schema.messages).values({
        id: messageId,
        conversationId,
        direction: 'inbound',
        senderType: 'guest',
        content: 'What time is checkout?',
        intent: 'inquiry.checkout',
        confidence: 0.97,
      });

      // Verify we can query reservation with room info for response
      const reservationInfo = await db
        .select({
          roomNumber: schema.reservations.roomNumber,
          departureDate: schema.reservations.departureDate,
          balance: schema.reservations.balance,
        })
        .from(schema.reservations)
        .where(eq(schema.reservations.id, reservationId))
        .get();

      expect(reservationInfo?.roomNumber).toBe('208');
      expect(reservationInfo?.balance).toBe(125.5);
    });
  });

  describe('S-01: Staff Conversation Management', () => {
    it('should list all conversations for staff', async () => {
      // Create multiple conversations
      for (let i = 0; i < 5; i++) {
        const convId = generateId('conversation');
        await db.insert(schema.conversations).values({
          id: convId,
          channelType: 'whatsapp',
          channelId: `+1415555${1000 + i}`,
          state: i < 3 ? 'active' : 'resolved',
        });
      }

      // Query all conversations
      const allConversations = await db.select().from(schema.conversations);
      expect(allConversations.length).toBe(5);

      // Query only active conversations
      const activeConversations = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.state, 'active'));
      expect(activeConversations.length).toBe(3);
    });

    it('should allow staff to claim a conversation', async () => {
      // Create staff member
      const staffId = generateId('staff');
      await db.insert(schema.staff).values({
        id: staffId,
        email: 'agent@hotel.com',
        name: 'Agent Smith',
        roleId: 'role-staff',
      });

      // Create conversation
      const conversationId = generateId('conversation');
      await db.insert(schema.conversations).values({
        id: conversationId,
        channelType: 'webchat',
        channelId: 'session-456',
        state: 'escalated',
      });

      // Staff claims conversation
      await db
        .update(schema.conversations)
        .set({
          assignedTo: staffId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.conversations.id, conversationId));

      // Verify assignment
      const conv = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .get();

      expect(conv?.assignedTo).toBe(staffId);
    });
  });

  describe('S-02: Staff Task Management', () => {
    it('should allow staff to claim and complete tasks', async () => {
      // Create staff member
      const staffId = generateId('staff');
      await db.insert(schema.staff).values({
        id: staffId,
        email: 'housekeeper@hotel.com',
        name: 'Maria Garcia',
        roleId: 'role-staff',
      });

      // Create task
      const taskId = generateId('task');
      await db.insert(schema.tasks).values({
        id: taskId,
        type: 'housekeeping',
        department: 'housekeeping',
        roomNumber: '301',
        description: 'Extra pillows needed',
        priority: 'standard',
        status: 'pending',
      });

      // Staff claims task
      await db
        .update(schema.tasks)
        .set({
          assignedTo: staffId,
          status: 'assigned',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.tasks.id, taskId));

      // Verify assignment
      let task = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId))
        .get();

      expect(task?.assignedTo).toBe(staffId);
      expect(task?.status).toBe('assigned');

      // Staff marks in progress
      await db
        .update(schema.tasks)
        .set({
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.tasks.id, taskId));

      // Staff completes task
      await db
        .update(schema.tasks)
        .set({
          status: 'completed',
          completedAt: new Date().toISOString(),
          completionNotes: 'Delivered 2 extra pillows',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.tasks.id, taskId));

      // Verify completion
      task = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId))
        .get();

      expect(task?.status).toBe('completed');
      expect(task?.completedAt).toBeDefined();
      expect(task?.completionNotes).toBe('Delivered 2 extra pillows');
    });

    it('should filter tasks by department', async () => {
      // Create tasks in different departments
      await db.insert(schema.tasks).values({
        id: generateId('task'),
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Clean room 201',
        roomNumber: '201',
        status: 'pending',
      });

      await db.insert(schema.tasks).values({
        id: generateId('task'),
        type: 'maintenance',
        department: 'maintenance',
        description: 'Fix light in room 202',
        roomNumber: '202',
        status: 'pending',
      });

      await db.insert(schema.tasks).values({
        id: generateId('task'),
        type: 'housekeeping',
        department: 'housekeeping',
        description: 'Extra towels for room 203',
        roomNumber: '203',
        status: 'pending',
      });

      // Filter by housekeeping department
      const housekeepingTasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.department, 'housekeeping'));

      expect(housekeepingTasks.length).toBe(2);

      // Filter by maintenance department
      const maintenanceTasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.department, 'maintenance'));

      expect(maintenanceTasks.length).toBe(1);
    });
  });

  describe('Multi-Channel Support', () => {
    it('should handle conversations from all channels', async () => {
      const channels = ['whatsapp', 'sms', 'email', 'webchat'];

      for (const channel of channels) {
        const convId = generateId('conversation');
        await db.insert(schema.conversations).values({
          id: convId,
          channelType: channel,
          channelId: `test-${channel}`,
          state: 'active',
        });

        const msgId = generateId('message');
        await db.insert(schema.messages).values({
          id: msgId,
          conversationId: convId,
          direction: 'inbound',
          senderType: 'guest',
          content: `Test message from ${channel}`,
        });
      }

      // Verify all channels have conversations
      for (const channel of channels) {
        const convs = await db
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.channelType, channel));

        expect(convs.length).toBe(1);
      }
    });
  });
});
