/**
 * Demo Data Seeds
 *
 * Realistic hotel data for testing and demonstration.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { guests, reservations, knowledgeBase, conversations, messages, tasks } from '@/db/schema.js';
import { createLogger } from '@/utils/logger.js';
import { demoGuests } from './guests.js';
import { demoReservations } from './reservations.js';
import { demoKnowledgeBase } from './knowledge-base.js';
import { demoConversations, demoMessages } from './conversations.js';
import { demoTasks } from './tasks.js';

export { demoGuests, demoReservations, demoKnowledgeBase, demoConversations, demoMessages, demoTasks };

const log = createLogger('db:seeds');

export interface DemoDataCounts {
  guests: number;
  reservations: number;
  knowledgeBase: number;
  conversations: number;
  messages: number;
  tasks: number;
}

/**
 * Insert demo/sample data into the database. Rows that fail to insert (e.g.
 * re-running against an already-seeded database) are skipped, not fatal.
 */
export async function loadDemoData(): Promise<DemoDataCounts> {
  const counts: DemoDataCounts = {
    guests: 0,
    reservations: 0,
    knowledgeBase: 0,
    conversations: 0,
    messages: 0,
    tasks: 0,
  };

  for (const guest of demoGuests) {
    try {
      await db.insert(guests).values(guest);
      counts.guests++;
    } catch (e) {
      log.warn({ email: guest.email, err: e }, 'Skipping demo guest');
    }
  }

  for (const reservation of demoReservations) {
    try {
      await db.insert(reservations).values(reservation);
      counts.reservations++;
    } catch (e) {
      log.warn({ confirmationNumber: reservation.confirmationNumber, err: e }, 'Skipping demo reservation');
    }
  }

  for (const entry of demoKnowledgeBase) {
    try {
      await db.insert(knowledgeBase).values(entry);
      counts.knowledgeBase++;
    } catch (e) {
      log.warn({ title: entry.title, err: e }, 'Skipping demo knowledge entry');
    }
  }

  for (const conversation of demoConversations) {
    try {
      await db.insert(conversations).values(conversation);
      counts.conversations++;
    } catch (e) {
      log.warn({ id: conversation.id, err: e }, 'Skipping demo conversation');
    }
  }

  for (const message of demoMessages) {
    try {
      await db.insert(messages).values(message);
      counts.messages++;
    } catch (e) {
      log.warn({ id: message.id, err: e }, 'Skipping demo message');
    }
  }

  for (const task of demoTasks) {
    try {
      await db.insert(tasks).values(task);
      counts.tasks++;
    } catch (e) {
      log.warn({ id: task.id, err: e }, 'Skipping demo task');
    }
  }

  return counts;
}

/** Guest-facing data tables cleared by resetDemoData — config/staff/roles are preserved. */
const RESETTABLE_TABLES = ['messages', 'tasks', 'webchat_sessions', 'conversations', 'reservations', 'knowledge_base', 'guests'];

/**
 * Delete all rows from guest-facing data tables, preserving config, staff, and roles.
 * Returns the list of tables that were successfully cleared.
 */
export async function resetDemoData(): Promise<string[]> {
  await db.run(sql`PRAGMA foreign_keys = OFF`);

  const tablesCleared: string[] = [];
  for (const tableName of RESETTABLE_TABLES) {
    try {
      await db.run(sql.raw(`DELETE FROM "${tableName}"`));
      tablesCleared.push(tableName);
    } catch (e) {
      log.warn({ tableName, err: e }, 'Failed to clear table');
    }
  }

  await db.run(sql`PRAGMA foreign_keys = ON`);

  return tablesCleared;
}
