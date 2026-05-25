import { Hono } from 'hono';
import type { AuthEnv } from '@/modules/auth/middleware.js';
import { getLiveStats } from '@/modules/analytics/service.js';

/** Analytics read endpoints — available to all authenticated staff; the
 *  response is role-scoped in the service (team view for admins, personal for
 *  agents). */
export const analyticsRoutes = new Hono<AuthEnv>();

analyticsRoutes.get('/live', (c) => {
  // `agent` scopes to one agent's queue; honoured for admins only (enforced in
  // the service), ignored otherwise.
  const agent = c.req.query('agent') || undefined;
  return c.json(getLiveStats(c.get('user'), agent));
});
