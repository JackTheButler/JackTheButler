/**
 * Health Check Routes
 *
 * Endpoints for monitoring and load balancer health checks.
 */

import { Hono } from 'hono';
import { isDatabaseHealthy } from '@/db/index.js';
import { scheduler } from '@/services/scheduler.js';

const health = new Hono();

/**
 * Liveness probe - is the process running?
 * Used by Kubernetes/Docker to detect crashed containers.
 */
health.get('/live', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Readiness probe - is the service ready to accept traffic?
 * Checks database connectivity.
 */
health.get('/ready', (c) => {
  const dbHealthy = isDatabaseHealthy();

  if (!dbHealthy) {
    return c.json(
      {
        status: 'not ready',
        checks: {
          database: 'error',
        },
        timestamp: new Date().toISOString(),
      },
      503
    );
  }

  return c.json({
    status: 'ready',
    checks: {
      database: 'ok',
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Detailed health check for debugging
 */
health.get('/', (c) => {
  const dbHealthy = isDatabaseHealthy();
  const schedulerStatus = scheduler.getStatus();

  return c.json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    version: '0.8.0',
    uptime: process.uptime(),
    checks: {
      database: dbHealthy ? 'ok' : 'error',
    },
    scheduler: schedulerStatus,
    timestamp: new Date().toISOString(),
  });
});

export { health as healthRoutes };
