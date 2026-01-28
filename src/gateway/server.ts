/**
 * Gateway Server
 *
 * Hono HTTP server with routes and middleware.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { healthRoutes } from './routes/health.js';
import { apiRoutes } from './routes/api.js';
import { webhookRoutes } from './routes/webhooks/index.js';
import { errorHandler, requestLogger } from './middleware/index.js';

/**
 * Create and configure the Hono app
 */
export function createApp() {
  const app = new Hono();

  // Security headers
  app.use('*', secureHeaders());

  // CORS - allow all origins in development
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Request-Id'],
      maxAge: 86400,
    })
  );

  // Request logging
  app.use('*', requestLogger());

  // Error handling
  app.onError(errorHandler);

  // Health check routes (no auth required)
  app.route('/health', healthRoutes);

  // Webhook routes (no auth, uses signature verification)
  app.route('/webhooks', webhookRoutes);

  // API routes
  app.route('/api/v1', apiRoutes);

  // Root redirect to health
  app.get('/', (c) => {
    return c.json({
      name: 'Jack The Butler',
      version: '0.7.0',
      status: 'running',
      docs: '/api/v1',
      health: '/health',
    });
  });

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: `Route ${c.req.method} ${c.req.path} not found`,
        },
      },
      404
    );
  });

  return app;
}

export const app = createApp();
