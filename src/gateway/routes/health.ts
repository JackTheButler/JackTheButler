/**
 * Health Check Routes
 *
 * Endpoints for monitoring and load balancer health checks.
 */

import { Hono } from 'hono';
import { isDatabaseHealthy } from '@/db/index.js';
import { scheduler } from '@/services/scheduler.js';
import { getMetrics } from '@/monitoring/index.js';
import { getVersion } from '@/config/version.js';

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
    version: getVersion(),
    uptime: process.uptime(),
    checks: {
      database: dbHealthy ? 'ok' : 'error',
    },
    scheduler: schedulerStatus,
    timestamp: new Date().toISOString(),
  });
});

/**
 * System info endpoint
 * Returns version, uptime, memory usage, and basic stats
 */
health.get('/info', (c) => {
  const memUsage = process.memoryUsage();

  return c.json({
    name: 'Jack The Butler',
    version: getVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
    },
    scheduler: scheduler.getStatus(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Metrics endpoint
 * Returns application metrics (counters, histograms, gauges)
 */
health.get('/metrics', (c) => {
  const allMetrics = getMetrics();

  return c.json({
    ...allMetrics,
    timestamp: new Date().toISOString(),
  });
});

export { health as healthRoutes };
