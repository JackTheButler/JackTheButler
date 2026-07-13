/**
 * Activities Routes
 *
 * Recent activity feed — tasks, escalations, AI resolutions, check-ins/outs.
 * Used by the dashboard Live Activity ticker.
 */

import { Hono } from 'hono';
import { getRecentActivity } from '@/services/activity-log.js';
import type { ActivityItem } from '@/services/activity-log.js';
import { requireAuth } from '../middleware/auth.js';

export type { ActivityItem };

const activitiesRouter = new Hono();

activitiesRouter.use('*', requireAuth);

/**
 * GET /api/v1/activities/recent?limit=20
 * Returns the most recent activity items merged from tasks, conversations, and reservations.
 */
activitiesRouter.get('/recent', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 50);

  const items = await getRecentActivity(limit);

  return c.json({ items });
});

export { activitiesRouter };
