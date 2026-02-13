/**
 * Gateway Server
 *
 * Hono HTTP server with routes and middleware.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { healthRoutes } from './routes/health.js';
import { setupRoutes } from './routes/setup.js';
import { apiRoutes } from './routes/api.js';
import { webhookRoutes } from './routes/webhooks/index.js';
import { errorHandler, requestLogger, securityHeaders, apiRateLimit } from './middleware/index.js';

/**
 * Create and configure the Hono app
 */
export function createApp() {
  const app = new Hono();

  // Serve widget.js bundle (for hotel website embeds)
  // Registered before security headers — widget is loaded cross-origin by hotel sites
  app.get('/widget.js', async (c) => {
    const fs = await import('node:fs/promises');
    // Production: ./widget/widget.js (Docker copies dist here)
    // Development: ./apps/webchat/dist/widget.js (local build output)
    const paths = ['./widget/widget.js', './apps/webchat/dist/widget.js'];
    for (const filePath of paths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return c.body(content, 200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        });
      } catch {
        continue;
      }
    }
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Widget not built. Run: pnpm build:webchat',
        },
      },
      404
    );
  });

  // Security headers (CSP, X-Frame-Options, HSTS, etc.)
  app.use('*', securityHeaders);

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

  // Setup routes (no auth required, for fresh installations)
  app.route('/api/v1/setup', setupRoutes);

  // Webhook routes (no auth, uses signature verification)
  app.route('/webhooks', webhookRoutes);

  // API rate limiting (100 req/min per IP)
  app.use('/api/*', apiRateLimit);

  // API routes
  app.route('/api/v1', apiRoutes);

  // Serve dashboard static files (production)
  app.use(
    '/assets/*',
    serveStatic({
      root: './dashboard',
      rewriteRequestPath: (path) => path,
    })
  );

  // Serve dashboard index.html for all non-API routes (SPA client-side routing)
  app.get('*', async (c) => {
    const path = c.req.path;

    // Skip API, webhooks, and health routes
    if (path.startsWith('/api') || path.startsWith('/webhooks') || path.startsWith('/health')) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Route ${c.req.method} ${path} not found`,
          },
        },
        404
      );
    }

    // Try to serve static file first
    try {
      const fs = await import('node:fs/promises');
      const fsPath = `./dashboard${path === '/' ? '/index.html' : path}`;

      // Check if it's a file request (has extension)
      if (path.includes('.')) {
        const content = await fs.readFile(fsPath);
        const ext = path.split('.').pop();
        const mimeTypes: Record<string, string> = {
          html: 'text/html',
          js: 'application/javascript',
          css: 'text/css',
          json: 'application/json',
          png: 'image/png',
          jpg: 'image/jpeg',
          svg: 'image/svg+xml',
          ico: 'image/x-icon',
        };
        return c.body(content, 200, {
          'Content-Type': mimeTypes[ext || 'html'] || 'application/octet-stream',
        });
      }

      // For all other routes, serve index.html (SPA routing)
      const indexHtml = await fs.readFile('./dashboard/index.html', 'utf-8');
      return c.html(indexHtml);
    } catch {
      // Dashboard not built or file not found - return API info
      return c.json({
        name: 'Jack The Butler',
        version: '1.0.0',
        status: 'running',
        docs: '/api/v1',
        health: '/health',
        note: 'Dashboard not available. Build with: pnpm --filter @jack/dashboard build',
      });
    }
  });

  return app;
}

export const app = createApp();
