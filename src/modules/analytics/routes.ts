import { Hono, type Context } from 'hono';
import type { AuthEnv } from '@/modules/auth/middleware.js';
import { getBreakdowns, getKpis, getLiveStats, getTrends } from '@/modules/analytics/service.js';

/** Analytics read endpoints — available to all authenticated staff; the
 *  response is role-scoped in the service (team view for admins, personal for
 *  agents). The `agent` query param scopes to one agent and is honoured for
 *  admins only (enforced in the service), ignored otherwise. */
export const analyticsRoutes = new Hono<AuthEnv>();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight (server-local) of a `YYYY-MM-DD` string, or null if unparseable. */
function startOfDay(iso: string | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve the `from`/`to` query into a half-open `[from, to)` window. Both are
 * inclusive `YYYY-MM-DD` days from the client, so `to` becomes the start of the
 * day *after* the requested end. Defaults to the last 7 days; clamps a reversed
 * or empty range to a single day so the math stays sane.
 */
function dateWindow(c: Context): { from: Date; to: Date } {
  const now = new Date();
  const fromParam = startOfDay(c.req.query('from'));
  const toParam = startOfDay(c.req.query('to'));
  const to = toParam ? new Date(toParam.getTime() + DAY_MS) : now; // exclusive end
  const from = fromParam ?? new Date(now.getTime() - 7 * DAY_MS);
  if (from.getTime() >= to.getTime()) return { from: new Date(to.getTime() - DAY_MS), to };
  return { from, to };
}

const agentOf = (c: Context) => c.req.query('agent') || undefined;

analyticsRoutes.get('/live', (c) => c.json(getLiveStats(c.get('user'), agentOf(c))));

analyticsRoutes.get('/kpis', (c) => {
  const { from, to } = dateWindow(c);
  return c.json(getKpis(c.get('user'), from, to, agentOf(c)));
});

analyticsRoutes.get('/trends', (c) => {
  const { from, to } = dateWindow(c);
  return c.json(getTrends(c.get('user'), from, to, agentOf(c)));
});

analyticsRoutes.get('/breakdowns', (c) => {
  const { from, to } = dateWindow(c);
  return c.json(getBreakdowns(c.get('user'), from, to, agentOf(c)));
});
