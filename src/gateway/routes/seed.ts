/**
 * Seed Routes
 *
 * API endpoints for demo data and database reset.
 *
 * @module gateway/routes/seed
 */

import { Hono } from 'hono';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '@/permissions/index.js';
import { loadDemoData, resetDemoData } from '@/db/seeds/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('routes:seed');

const seedRoutes = new Hono();

// Apply auth to all routes
seedRoutes.use('/*', requireAuth);

/**
 * POST /api/v1/seed/demo
 * Load demo data into the database
 */
seedRoutes.post('/demo', requirePermission(PERMISSIONS.ADMIN_MANAGE), async (c) => {
  try {
    const created = await loadDemoData();
    return c.json({ success: true, created });
  } catch (error) {
    log.error({ error }, 'Failed to load demo data');
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

    const tablesCleared = await resetDemoData();

    return c.json({ success: true, tablesCleared });
  } catch (error) {
    log.error({ error }, 'Failed to reset database');
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
