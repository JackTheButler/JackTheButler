/**
 * Seed Routes
 *
 * API endpoints for demo data and database reset.
 *
 * @module gateway/routes/seed
 */

import { Hono } from 'hono';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '@/core/permissions/index.js';
import { db } from '@/db/index.js';
import { guests, reservations, knowledgeBase, conversations, messages, tasks } from '@/db/schema.js';
import {
  demoGuests,
  demoReservations,
  demoKnowledgeBase,
  demoConversations,
  demoMessages,
  demoTasks,
} from '@/db/seeds/index.js';
import { sql } from 'drizzle-orm';

const seedRoutes = new Hono();

// Apply auth to all routes
seedRoutes.use('/*', requireAuth);

/**
 * POST /api/v1/seed/demo
 * Load demo data into the database
 */
seedRoutes.post('/demo', requirePermission(PERMISSIONS.ADMIN_MANAGE), async (c) => {
  try {
    // Insert guests
    let guestsCreated = 0;
    for (const guest of demoGuests) {
      try {
        await db.insert(guests).values(guest);
        guestsCreated++;
      } catch (e) {
        // Skip if duplicate (e.g., already exists)
        console.warn(`Skipping guest ${guest.email}: ${e}`);
      }
    }

    // Insert reservations
    let reservationsCreated = 0;
    for (const reservation of demoReservations) {
      try {
        await db.insert(reservations).values(reservation);
        reservationsCreated++;
      } catch (e) {
        console.warn(`Skipping reservation ${reservation.confirmationNumber}: ${e}`);
      }
    }

    // Insert knowledge base entries
    let knowledgeCreated = 0;
    for (const entry of demoKnowledgeBase) {
      try {
        await db.insert(knowledgeBase).values(entry);
        knowledgeCreated++;
      } catch (e) {
        console.warn(`Skipping knowledge entry ${entry.title}: ${e}`);
      }
    }

    // Insert conversations
    let conversationsCreated = 0;
    for (const conversation of demoConversations) {
      try {
        await db.insert(conversations).values(conversation);
        conversationsCreated++;
      } catch (e) {
        console.warn(`Skipping conversation ${conversation.id}: ${e}`);
      }
    }

    // Insert messages
    let messagesCreated = 0;
    for (const message of demoMessages) {
      try {
        await db.insert(messages).values(message);
        messagesCreated++;
      } catch (e) {
        console.warn(`Skipping message ${message.id}: ${e}`);
      }
    }

    // Insert tasks
    let tasksCreated = 0;
    for (const task of demoTasks) {
      try {
        await db.insert(tasks).values(task);
        tasksCreated++;
      } catch (e) {
        console.warn(`Skipping task ${task.id}: ${e}`);
      }
    }

    return c.json({
      success: true,
      created: {
        guests: guestsCreated,
        reservations: reservationsCreated,
        knowledgeBase: knowledgeCreated,
        conversations: conversationsCreated,
        messages: messagesCreated,
        tasks: tasksCreated,
      },
    });
  } catch (error) {
    console.error('Failed to load demo data:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to load demo data',
      },
      500
    );
  }
});

/**
 * POST /api/v1/seed/reset
 * Reset the entire database (requires confirmation)
 */
seedRoutes.post('/reset', requirePermission(PERMISSIONS.ADMIN_MANAGE), async (c) => {
  try {
    const body = await c.req.json();

    // Require explicit confirmation
    if (body.confirm !== 'RESET') {
      return c.json(
        {
          success: false,
          error: 'Confirmation required. Send { "confirm": "RESET" } to proceed.',
        },
        400
      );
    }

    // Only reset guest-facing data tables — preserve config, staff, roles, etc.
    const tableNames = [
      'messages',
      'tasks',
      'approval_queue',
      'webchat_sessions',
      'conversations',
      'reservations',
      'knowledge_base',
      'guests',
    ];

    // Disable foreign key checks
    await db.run(sql`PRAGMA foreign_keys = OFF`);

    // Delete all data from each table
    const tablesCleared: string[] = [];
    for (const tableName of tableNames) {
      try {
        await db.run(sql.raw(`DELETE FROM "${tableName}"`));
        tablesCleared.push(tableName);
      } catch (e) {
        console.warn(`Failed to clear table ${tableName}:`, e);
      }
    }

    // Re-enable foreign key checks
    await db.run(sql`PRAGMA foreign_keys = ON`);

    return c.json({
      success: true,
      tablesCleared,
    });
  } catch (error) {
    console.error('Failed to reset database:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to reset database',
      },
      500
    );
  }
});

export { seedRoutes };
