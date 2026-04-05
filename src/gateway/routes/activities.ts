/**
 * Activities Routes
 *
 * Recent activity feed — tasks, escalations, AI resolutions, check-ins/outs.
 * Used by the dashboard Live Activity ticker.
 */

import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { db, tasks, conversations, reservations, guests, messages } from '@/db/index.js';
import { requireAuth } from '../middleware/auth.js';

export interface ActivityItem {
  id: string;
  type: 'ai_reply' | 'ai_resolved' | 'task_created' | 'checkin' | 'escalated' | 'checkout';
  text: string;    // English fallback
  detail: string;  // English fallback
  ts: number; // Unix ms
  channel?: string; // e.g. 'whatsapp', 'email', 'sms', 'webchat' — set when known
  data?: {
    taskType?: string;
    priority?: string;
    roomNumber?: string;
    roomType?: string;
    guestName?: string;
    intent?: string;
    snippet?: string;
  };
}

const activitiesRouter = new Hono();

activitiesRouter.use('*', requireAuth);

/**
 * GET /api/v1/activities/recent?limit=20
 * Returns the most recent activity items merged from tasks, conversations, and reservations.
 */
activitiesRouter.get('/recent', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 50);
  // Cap each source so no single type dominates the merged result
  const perSource = Math.ceil(limit / 2);

  const [recentTasks, recentConversations, recentReservations, recentAiMessages] = await Promise.all([
    // Recent tasks
    db
      .select({
        id: tasks.id,
        type: tasks.type,
        roomNumber: tasks.roomNumber,
        priority: tasks.priority,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .orderBy(desc(tasks.createdAt))
      .limit(perSource),

    // Recent escalated / resolved conversations
    db
      .select({
        id: conversations.id,
        state: conversations.state,
        channelType: conversations.channelType,
        currentIntent: conversations.currentIntent,
        resolvedAt: conversations.resolvedAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(
        sql`(
          (${conversations.state} = 'escalated' AND ${conversations.updatedAt} >= datetime('now', '-7 days'))
          OR
          (${conversations.state} = 'resolved'  AND ${conversations.resolvedAt} >= datetime('now', '-7 days'))
        )`
      )
      .orderBy(
        sql`COALESCE(${conversations.resolvedAt}, ${conversations.updatedAt}) DESC`
      )
      .limit(perSource),

    // Recent check-ins / check-outs (join guest for name)
    db
      .select({
        id: reservations.id,
        status: reservations.status,
        roomNumber: reservations.roomNumber,
        roomType: reservations.roomType,
        actualArrival: reservations.actualArrival,
        actualDeparture: reservations.actualDeparture,
        updatedAt: reservations.updatedAt,
        guestId: reservations.guestId,
        firstName: guests.firstName,
        lastName: guests.lastName,
      })
      .from(reservations)
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(
        sql`${reservations.status} IN ('checked_in', 'checked_out')
          AND (
            (${reservations.status} = 'checked_in'  AND ${reservations.actualArrival}   >= datetime('now', '-7 days'))
            OR
            (${reservations.status} = 'checked_out' AND ${reservations.actualDeparture} >= datetime('now', '-7 days'))
          )`
      )
      .orderBy(
        sql`COALESCE(${reservations.actualDeparture}, ${reservations.actualArrival}) DESC`
      )
      .limit(perSource),

    // Recent AI outbound messages (last 7 days only)
    db
      .select({
        id: messages.id,
        content: messages.content,
        channelType: conversations.channelType,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(sql`${messages.senderType} = 'ai' AND ${messages.createdAt} >= datetime('now', '-7 days')`)
      .orderBy(desc(messages.createdAt))
      .limit(perSource),
  ]);

  const items: ActivityItem[] = [];

  for (const task of recentTasks) {
    const label = task.type.replace('_', ' ');
    const text = `${label.charAt(0).toUpperCase() + label.slice(1)} task created`;
    const detail = [task.roomNumber ? `Room ${task.roomNumber}` : null, task.priority !== 'standard' ? capitalize(task.priority) : null]
      .filter(Boolean)
      .join(' · ') || 'New task';
    items.push({
      id: `task-${task.id}`,
      type: 'task_created',
      text,
      detail,
      ts: new Date(task.createdAt).getTime(),
      data: { taskType: task.type, ...(task.priority !== 'standard' ? { priority: task.priority } : {}), ...(task.roomNumber ? { roomNumber: task.roomNumber } : {}) },
    });
  }

  for (const c of recentConversations) {
    const channel = capitalize(c.channelType);
    const intent = c.currentIntent ?? 'guest inquiry';
    if (c.state === 'escalated') {
      items.push({
        id: `conv-esc-${c.id}`,
        type: 'escalated',
        text: 'Conversation escalated to staff',
        detail: `${channel} · ${intent}`,
        channel: c.channelType,
        ts: new Date(c.updatedAt).getTime(),
        data: { ...(c.currentIntent ? { intent: c.currentIntent } : {}) },
      });
    } else {
      items.push({
        id: `conv-res-${c.id}`,
        type: 'ai_resolved',
        text: `AI resolved ${intent}`,
        detail: channel,
        channel: c.channelType,
        ts: new Date(c.resolvedAt ?? c.updatedAt).getTime(),
        data: { ...(c.currentIntent ? { intent: c.currentIntent } : {}) },
      });
    }
  }

  for (const r of recentReservations) {
    const name = `${r.firstName} ${r.lastName}`;
    const roomLabel = r.roomNumber ? `Room ${r.roomNumber}` : null;
    const typeLabel = isKnown(r.roomType) ? r.roomType : null;
    const detail = [roomLabel, typeLabel].filter(Boolean).join(' · ') || 'Guest stay';
    if (r.status === 'checked_in') {
      items.push({
        id: `res-in-${r.id}`,
        type: 'checkin',
        text: `${name} checked in`,
        detail,
        ts: new Date(r.actualArrival ?? r.updatedAt).getTime(),
        data: { guestName: name, ...(r.roomNumber ? { roomNumber: r.roomNumber } : {}), ...(isKnown(r.roomType) ? { roomType: r.roomType } : {}) },
      });
    } else {
      items.push({
        id: `res-out-${r.id}`,
        type: 'checkout',
        text: `${name} checked out`,
        detail,
        ts: new Date(r.actualDeparture ?? r.updatedAt).getTime(),
        data: { guestName: name, ...(r.roomNumber ? { roomNumber: r.roomNumber } : {}), ...(isKnown(r.roomType) ? { roomType: r.roomType } : {}) },
      });
    }
  }

  for (const m of recentAiMessages) {
    const channel = capitalize(m.channelType);
    const snippet = m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content;
    items.push({
      id: `msg-${m.id}`,
      type: 'ai_reply',
      text: 'AI replied to guest',
      detail: `${channel} · "${snippet}"`,
      channel: m.channelType,
      ts: new Date(m.createdAt).getTime(),
      data: { snippet },
    });
  }

  // Sort by timestamp descending, take top N
  items.sort((a, b) => b.ts - a.ts);

  return c.json({ items: items.slice(0, limit) });
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Returns false for null / empty / placeholder values like "Unknown" */
function isKnown(s: string | null | undefined): s is string {
  return !!s && s.toLowerCase() !== 'unknown' && s.trim() !== '';
}

export { activitiesRouter };
