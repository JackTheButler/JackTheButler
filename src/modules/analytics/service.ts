import { and, desc, eq, isNull } from 'drizzle-orm';
import type { LiveStats } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import { conversations, messages } from '@/db/schema/index.js';

/**
 * Analytics read model. Everything here is computed from the live tables with
 * no denormalised counters and no schema additions — see the LiveStats doc for
 * what's deliberately out of scope (presence, close timestamps).
 */

/** Latest real (non-lifecycle) message of a conversation. Mirrors the inbox's
 *  `needsReply` source of truth: a thread awaits a reply when this is from the
 *  customer. */
function lastRealMessage(conversationId: string) {
  return db
    .select({ author: messages.author })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), isNull(messages.event)))
    .orderBy(desc(messages.createdAt))
    .get();
}

/**
 * Awaiting-(human-)reply count + oldest wait (minutes) over a set of open
 * conversations. A conversation needs a human when either:
 *   • its latest real message is from the customer (no one has replied), or
 *   • `needsHuman` is set — the AI fell back to "connect a human" and no agent
 *     has taken over yet (the last message is the AI's fallback, so the
 *     author check alone would miss it).
 *
 * Wait is measured from `lastMessageAt`. For an escalation that's the AI
 * fallback's time, the closest proxy we have for "waiting since" — there's no
 * escalation timestamp until a conversation-events table lands.
 */
function awaitingStats(open: { id: string; lastMessageAt: Date; needsHuman: boolean }[]): {
  awaitingReply: number;
  oldestWaitMinutes: number;
} {
  const now = Date.now();
  let awaitingReply = 0;
  let oldestWaitMs = 0;
  for (const c of open) {
    const awaiting = c.needsHuman || lastRealMessage(c.id)?.author === 'customer';
    if (!awaiting) continue;
    awaitingReply += 1;
    const wait = now - c.lastMessageAt.getTime();
    if (wait > oldestWaitMs) oldestWaitMs = wait;
  }
  return { awaitingReply, oldestWaitMinutes: Math.floor(oldestWaitMs / 60_000) };
}

/**
 * Point-in-time queue stats, scoped to the viewer's role.
 *
 * Agents always see only their own queue — `requestedAgentId` is ignored for
 * them. Admins default to the team view, or scope to a specific agent when one
 * is requested (the dashboard's admin-only agent switcher).
 */
export function getLiveStats(
  viewer: { id: string; role: 'admin' | 'agent' },
  requestedAgentId?: string,
): LiveStats {
  const open = db
    .select()
    .from(conversations)
    .where(eq(conversations.status, 'open'))
    .all();

  // Only admins may scope to someone else; agents are pinned to themselves.
  const agentScope = viewer.role === 'admin' ? requestedAgentId : viewer.id;

  // Team view (admin, no agent selected): whole queue + unassigned count.
  if (!agentScope) {
    return {
      scope: 'team',
      unassigned: open.filter((c) => !c.assignedAgentId).length,
      myOpen: null,
      ...awaitingStats(open),
    };
  }

  // Personal view: one agent's assigned queue.
  const mine = open.filter((c) => c.assignedAgentId === agentScope);
  return {
    scope: 'agent',
    unassigned: null,
    myOpen: mine.length,
    ...awaitingStats(mine),
  };
}
