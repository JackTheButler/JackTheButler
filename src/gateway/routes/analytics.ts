/**
 * Analytics Routes
 *
 * Dashboard overview metrics with date range filtering and optional comparison.
 * Requires authentication only — all staff should see the home dashboard.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { requireAuth } from '../middleware/auth.js';
import { getAnalyticsOverview } from '@/services/analytics.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365;

function isValidDate(s: string): boolean {
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000);
}

const isoDate = z
  .string()
  .regex(ISO_DATE, 'must be YYYY-MM-DD')
  .refine(isValidDate, 'invalid calendar date');

const overviewQuerySchema = z
  .object({
    from:        isoDate,
    to:          isoDate,
    compareFrom: isoDate.optional(),
    compareTo:   isoDate.optional(),
    /** Browser UTC offset in minutes, e.g. 300 for UTC+5. Defaults to 0. */
    utcOffset:   z.coerce.number().int().min(-840).max(840).default(0),
  })
  .refine((d) => d.from <= d.to, {
    message: 'from must be before or equal to to',
  })
  .refine((d) => daysBetween(d.from, d.to) <= MAX_RANGE_DAYS, {
    message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`,
  })
  .refine((d) => !d.compareFrom || d.compareTo !== undefined, {
    message: 'compareTo is required when compareFrom is provided',
  })
  .refine((d) => !d.compareTo || d.compareFrom !== undefined, {
    message: 'compareFrom is required when compareTo is provided',
  })
  .refine(
    (d) => !d.compareFrom || !d.compareTo || daysBetween(d.compareFrom, d.compareTo) <= MAX_RANGE_DAYS,
    { message: `Compare range cannot exceed ${MAX_RANGE_DAYS} days` }
  );

type Variables = { validatedQuery: unknown };

const analyticsRouter = new Hono<{ Variables: Variables }>();

analyticsRouter.use('/*', requireAuth);

/**
 * GET /api/v1/analytics/overview
 *
 * Query params:
 *   from          YYYY-MM-DD  start of primary range (required)
 *   to            YYYY-MM-DD  end of primary range, inclusive (required)
 *   compareFrom   YYYY-MM-DD  start of comparison range (optional)
 *   compareTo     YYYY-MM-DD  end of comparison range, inclusive (optional)
 *   utcOffset     integer     browser UTC offset in minutes (optional, default 0)
 */
analyticsRouter.get(
  '/overview',
  validateQuery(overviewQuerySchema),
  async (c) => {
    const q = c.get('validatedQuery') as z.infer<typeof overviewQuerySchema>;

    const overview = await getAnalyticsOverview({
      range:            { from: q.from, to: q.to },
      compareRange:     q.compareFrom && q.compareTo
        ? { from: q.compareFrom, to: q.compareTo }
        : undefined,
      utcOffsetMinutes: q.utcOffset,
    });

    return c.json(overview);
  }
);

export { analyticsRouter };
