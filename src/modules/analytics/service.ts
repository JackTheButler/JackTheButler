import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { Breakdowns, KpiMetrics, KpiStats, LiveStats, TrendStats } from '@janetheoperator/shared';
import { db } from '@/db/client.js';
import { conversations, episodes, messages, staff } from '@/db/schema/index.js';

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

/** How recently a staff row's `lastSeenAt` must be for them to count as
 *  "active now". The dashboard heartbeat fires every ~45s, so this tolerates a
 *  few missed beats (a brief network blip) without dropping the agent. */
const ACTIVE_AGENT_WINDOW_MS = 5 * 60_000;

/** Count of active-status staff whose presence heartbeat is within the window. */
function activeAgentCount(): number {
  const cutoff = new Date(Date.now() - ACTIVE_AGENT_WINDOW_MS);
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(staff)
    .where(and(eq(staff.status, 'active'), gte(staff.lastSeenAt, cutoff)))
    .get();
  return Number(row?.count ?? 0);
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
      activeAgents: activeAgentCount(),
      myOpen: null,
      ...awaitingStats(open),
    };
  }

  // Personal view: one agent's assigned queue.
  const mine = open.filter((c) => c.assignedAgentId === agentScope);
  return {
    scope: 'agent',
    unassigned: null,
    activeAgents: null,
    myOpen: mine.length,
    ...awaitingStats(mine),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bucket size for trend series, scaled to the window so the chart stays
 *  readable: daily up to ~a month, weekly up to ~6 months, else monthly. */
function bucketMsFor(spanMs: number): number {
  const days = spanMs / DAY_MS;
  if (days <= 31) return DAY_MS;
  if (days <= 180) return 7 * DAY_MS;
  return 30 * DAY_MS;
}

function scopeFor(viewer: { id: string; role: 'admin' | 'agent' }, requestedAgentId?: string) {
  // Only admins may scope to someone else; agents are pinned to themselves.
  return (viewer.role === 'admin' ? requestedAgentId : viewer.id) ?? null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Episodes closed in `[from, to)`, optionally scoped to the agent who closed. */
function closedEpisodes(from: Date, to: Date, agentId: string | null) {
  const conds = [gte(episodes.closedAt, from), lt(episodes.closedAt, to)];
  if (agentId) conds.push(eq(episodes.closedByAgentId, agentId));
  return db
    .select()
    .from(episodes)
    .where(and(...conds))
    .all();
}

function metricsFor(rows: (typeof episodes.$inferSelect)[]): KpiMetrics {
  const n = rows.length;
  const resolution = rows.map((r) => (r.closedAt.getTime() - r.openedAt.getTime()) / 1000);
  const firstResponse = rows
    .filter((r) => r.firstResponseAt)
    .map((r) => (r.firstResponseAt!.getTime() - r.openedAt.getTime()) / 1000);
  return {
    episodes: n,
    aiDeflectionRate: n ? rows.filter((r) => r.aiDeflected).length / n : 0,
    handoffRate: n ? rows.filter((r) => r.handedOff).length / n : 0,
    reopenedRate: n ? rows.filter((r) => r.openedVia === 'reopen').length / n : 0,
    medianFirstResponseSec: median(firstResponse),
    medianResolutionSec: median(resolution),
  };
}

/**
 * Historical KPIs over `[from, to)`, with the same-length preceding period for
 * deltas. Role-scoped like {@link getLiveStats}; an agent's view counts the
 * episodes they closed. Reads the `episodes` projection (empty until the
 * projection job has run).
 */
export function getKpis(
  viewer: { id: string; role: 'admin' | 'agent' },
  from: Date,
  to: Date,
  requestedAgentId?: string,
): KpiStats {
  const agentScope = scopeFor(viewer, requestedAgentId);
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);

  return {
    scope: agentScope ? 'agent' : 'team',
    current: metricsFor(closedEpisodes(from, to, agentScope)),
    previous: metricsFor(closedEpisodes(prevFrom, from, agentScope)),
  };
}

/**
 * Time-bucketed trends over `[from, to)`, role-scoped like {@link getKpis}.
 * Bucket size scales with the window (daily / weekly / monthly).
 */
export function getTrends(
  viewer: { id: string; role: 'admin' | 'agent' },
  from: Date,
  to: Date,
  requestedAgentId?: string,
): TrendStats {
  const agentScope = scopeFor(viewer, requestedAgentId);
  const startMs = from.getTime();
  const span = to.getTime() - startMs;
  const bucketMs = bucketMsFor(span);
  const rows = closedEpisodes(from, to, agentScope);

  const count = Math.max(1, Math.ceil(span / bucketMs));
  const buckets: (typeof episodes.$inferSelect)[][] = Array.from({ length: count }, () => []);
  for (const r of rows) {
    const i = Math.floor((r.closedAt.getTime() - startMs) / bucketMs);
    if (i >= 0 && i < count) buckets[i].push(r);
  }

  const points = buckets.map((rowsInBucket, i) => {
    const n = rowsInBucket.length;
    const ai = rowsInBucket.filter((r) => r.aiDeflected).length;
    const resolution = rowsInBucket.map((r) => (r.closedAt.getTime() - r.openedAt.getTime()) / 1000);
    return {
      date: new Date(startMs + i * bucketMs).toISOString().slice(0, 10),
      aiResolved: ai,
      human: n - ai,
      deflectionRate: n ? ai / n : null,
      medianResolutionSec: median(resolution),
    };
  });

  return { scope: agentScope ? 'agent' : 'team', points };
}

/**
 * Aggregate breakdowns over `[from, to)`, role-scoped like {@link getKpis}:
 * resolved volume per agent, volume by channel, and an opened-at heatmap.
 */
export function getBreakdowns(
  viewer: { id: string; role: 'admin' | 'agent' },
  from: Date,
  to: Date,
  requestedAgentId?: string,
): Breakdowns {
  const agentScope = scopeFor(viewer, requestedAgentId);
  const rows = closedEpisodes(from, to, agentScope);

  // Workload per agent (only agent-closed episodes carry an attribution).
  const names = new Map(
    db
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .all()
      .map((s) => [s.id, s.name] as const),
  );
  const byAgent = new Map<string, { resolved: number; frt: number[] }>();
  for (const r of rows) {
    if (!r.closedByAgentId) continue;
    const e = byAgent.get(r.closedByAgentId) ?? { resolved: 0, frt: [] };
    e.resolved += 1;
    if (r.firstResponseAt) e.frt.push((r.firstResponseAt.getTime() - r.openedAt.getTime()) / 1000);
    byAgent.set(r.closedByAgentId, e);
  }
  const workload = [...byAgent.entries()]
    .map(([agentId, e]) => ({
      agentId,
      name: names.get(agentId) ?? 'Unknown',
      resolved: e.resolved,
      medianFirstResponseSec: median(e.frt),
    }))
    .sort((a, b) => b.resolved - a.resolved);

  // Volume by channel (join to conversations; grouped in SQL to avoid loading).
  const channelRows = db
    .select({ channel: conversations.channel, count: sql<number>`count(*)` })
    .from(episodes)
    .innerJoin(conversations, eq(episodes.conversationId, conversations.id))
    .where(
      and(
        gte(episodes.closedAt, from),
        lt(episodes.closedAt, to),
        agentScope ? eq(episodes.closedByAgentId, agentScope) : undefined,
      ),
    )
    .groupBy(conversations.channel)
    .all();
  const channels = channelRows
    .map((c) => ({ channel: c.channel, count: Number(c.count) }))
    .sort((a, b) => b.count - a.count);

  // Opened-at heatmap, weekday (Mon=0) × hour. Server-local time.
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of rows) {
    const weekday = (r.openedAt.getDay() + 6) % 7; // shift Sun=0 → Mon=0
    heatmap[weekday][r.openedAt.getHours()] += 1;
  }

  return { scope: agentScope ? 'agent' : 'team', workload, channels, heatmap };
}
