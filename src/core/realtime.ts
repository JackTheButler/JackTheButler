import type { Env, Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { events } from '@/core/events.js';

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

export function broadcastToDashboard(type: string, data: unknown): void {
  const frame = JSON.stringify({ type, data });
  for (const sink of agents) {
    try {
      sink(frame);
    } catch {
      /* dead socket cleaned up on its close event */
    }
  }
}

// Forward domain events to dashboards. Add more `events.on(...)` lines here
// as new event kinds appear (notifications, etc.).
events.on('message.created', (p) => broadcastToDashboard('message.created', p));
events.on('message.updated', (p) => broadcastToDashboard('message.updated', p));

export function registerDashboardSocket<E extends Env>(
  app: Hono<E>,
  upgradeWebSocket: UpgradeWebSocket,
): void {
  app.get(
    '/api/app/realtime',
    upgradeWebSocket(() => {
      let remove = () => {};
      return {
        onOpen(_evt, ws) {
          const sink: Sink = (d) => ws.send(d);
          agents.add(sink);
          remove = () => agents.delete(sink);
        },
        onClose() {
          remove();
        },
      };
    }),
  );
}
