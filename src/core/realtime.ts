import type { Env, Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { eq } from 'drizzle-orm';
import { events, type EventMap } from '@/core/events.js';
import { db } from '@/db/client.js';
import { staff } from '@/db/schema/staff.js';
import type { AuthUser } from '@/modules/auth/middleware.js';

/**
 * Authenticated dashboard event channel. One WebSocket per agent tab,
 * carrying a generic `{ type, data }` envelope so new event kinds
 * (notifications, presence, …) reuse the same socket without new infra.
 *
 * The route lives under /api/app/* so the existing `requireAuth` wildcard
 * guards the upgrade — no separate auth here (protected-by-default).
 * Transport/wiring layer (hono) — not a service; the conversation logic
 * stays socket-unaware (it just emits on the event bus).
 */

type Sink = (data: string) => void;

// Single business → broadcast to every connected agent; the client filters
// by which conversation is open. Keyed loosely for future per-agent targeting.
const agents = new Set<Sink>();

function broadcast(type: string, data: unknown): void {
  const frame = JSON.stringify({ type, data });
  for (const sink of agents) {
    try {
      sink(frame);
    } catch {
      /* dead socket cleaned up on its close event */
    }
  }
}

/** Surface a bus event to every connected dashboard, preserving its name as
 *  the envelope `type`. The whole forwarding allowlist lives below — adding
 *  a realtime event to the UI is one `forward(...)` line + a `useRealtimeEvent`
 *  subscription on the client. */
function forward<K extends keyof EventMap>(type: K): void {
  events.on(type, (payload) => broadcast(type, payload));
}

forward('message.created');
forward('message.updated');
forward('message.knowledge');
forward('handoff.requested');
forward('assistant.typing');
forward('customer.typing');
forward('job.progress');

/**
 * Best-effort agent presence. Every open dashboard socket refreshes the
 * staff row's `lastSeenAt`; an analytics view derives "active agents" from a
 * recency window. DB writes are throttled per agent so the client heartbeat
 * (a `ping` every ~45s, plus the connect) can't hammer SQLite — accuracy is
 * unaffected since we always stamp a fresh-enough `now`.
 */
const PRESENCE_WRITE_MS = 30_000;
const lastPresenceWrite = new Map<string, number>();

function touchPresence(staffId: string): void {
  const now = Date.now();
  if (now - (lastPresenceWrite.get(staffId) ?? 0) < PRESENCE_WRITE_MS) return;
  lastPresenceWrite.set(staffId, now);
  try {
    db.update(staff).set({ lastSeenAt: new Date() }).where(eq(staff.id, staffId)).run();
  } catch {
    /* presence is best-effort; a failed write just means a stale lastSeenAt */
  }
}

export function registerDashboardSocket<E extends Env>(
  app: Hono<E>,
  upgradeWebSocket: UpgradeWebSocket,
): void {
  app.get(
    '/api/app/realtime',
    upgradeWebSocket((c) => {
      // Set by `requireAuth` on the /api/app/* wildcard guarding this upgrade.
      const staffId = (c.get('user') as AuthUser | undefined)?.id;
      let remove = () => {};
      return {
        onOpen(_evt, ws) {
          const sink: Sink = (d) => ws.send(d);
          agents.add(sink);
          remove = () => agents.delete(sink);
          if (staffId) touchPresence(staffId);
        },
        // The client sends a periodic `ping`; any inbound frame counts as
        // liveness and refreshes presence (throttled in touchPresence).
        onMessage() {
          if (staffId) touchPresence(staffId);
        },
        onClose() {
          remove();
        },
      };
    }),
  );
}
