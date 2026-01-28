/**
 * Admin Routes
 *
 * Administrative endpoints for system management.
 * These require authentication and should be protected in production.
 */

import { Hono } from 'hono';
import { scheduler } from '@/services/scheduler.js';
import { pmsSyncService } from '@/services/pms-sync.js';
import { createLogger } from '@/utils/logger.js';
import { requireAuth } from '../middleware/auth.js';

const log = createLogger('admin');

export const adminRouter = new Hono();

// Require authentication for all admin routes
adminRouter.use('*', requireAuth);

/**
 * GET /api/v1/admin/scheduler
 * Get scheduler status
 */
adminRouter.get('/scheduler', (c) => {
  const status = scheduler.getStatus();
  return c.json(status);
});

/**
 * POST /api/v1/admin/sync/pms
 * Manually trigger PMS sync
 */
adminRouter.post('/sync/pms', async (c) => {
  log.info('Manual PMS sync triggered via API');

  try {
    const result = await pmsSyncService.syncReservations();
    return c.json({
      success: true,
      result,
    });
  } catch (err) {
    log.error({ err }, 'Manual PMS sync failed');
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/v1/admin/scheduler/:jobName/trigger
 * Manually trigger a specific scheduled job
 */
adminRouter.post('/scheduler/:jobName/trigger', async (c) => {
  const jobName = c.req.param('jobName');
  log.info({ jobName }, 'Manual job trigger via API');

  try {
    await scheduler.triggerJob(jobName);
    return c.json({ success: true, message: `Job ${jobName} triggered` });
  } catch (err) {
    log.error({ err, jobName }, 'Failed to trigger job');
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      400
    );
  }
});
