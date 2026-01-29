/**
 * Jack The Butler - Entry Point
 *
 * AI-powered hospitality assistant for hotels.
 */

import { createServer } from 'node:http';
import { loadConfig, getEnv } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { closeDatabase, isDatabaseHealthy } from '@/db/index.js';
import { app, setupWebSocket } from '@/gateway/index.js';
import { scheduler } from '@/services/scheduler.js';
import { getEmailAdapter } from '@/channels/email/index.js';
import { extensionConfigService } from '@/services/extension-config.js';

const APP_NAME = 'Jack The Butler';
const VERSION = '1.0.0';

async function main(): Promise<void> {
  const config = loadConfig();

  // Banner
  logger.info(`
    ╔═══════════════════════════════════════╗
    ║                                       ║
    ║       🎩 ${APP_NAME}              ║
    ║          v${VERSION}                     ║
    ║                                       ║
    ║   AI-Powered Hospitality Assistant    ║
    ║                                       ║
    ╚═══════════════════════════════════════╝
  `);

  logger.info({ env: getEnv(), port: config.port }, 'Starting Jack The Butler');

  // Verify database is healthy
  if (!isDatabaseHealthy()) {
    logger.fatal('Database health check failed');
    process.exit(1);
  }
  logger.info('Database health check passed');

  // Load enabled extensions from database
  try {
    await extensionConfigService.loadEnabledExtensions();
    logger.info('Extensions loaded from database');
  } catch (error) {
    logger.error({ error }, 'Failed to load extensions from database');
  }

  // Create HTTP server
  const server = createServer((req, res) => {
    // Convert Node.js request to Web Request
    const url = `http://${req.headers.host}${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    // Collect body for non-GET requests
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      const method = req.method || 'GET';
      const request = new Request(url, {
        method,
        headers,
        body: body && method !== 'GET' && method !== 'HEAD' ? body : null,
      });

      try {
        const response = await app.fetch(request);

        // Send response
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });

        const responseBody = await response.arrayBuffer();
        res.end(Buffer.from(responseBody));
      } catch (error) {
        logger.error({ error }, 'Request handling error');
        res.statusCode = 500;
        res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }));
      }
    });
  });

  // Setup WebSocket on the same server
  setupWebSocket(server);

  // Start listening
  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server listening');
    logger.info({ paths: ['/ws', '/chat'] }, 'WebSocket servers ready');

    // Start background scheduler
    scheduler.start();
    logger.info('Background scheduler started');

    // Start email receiver if configured
    const emailAdapter = getEmailAdapter();
    if (emailAdapter) {
      emailAdapter.start();
      logger.info('Email receiver started');
    }

    logger.info('Ready! (Phase 8 - Polish)');
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');

    // Stop scheduler first
    scheduler.stop();
    logger.info('Scheduler stopped');

    // Stop email receiver if running
    const email = getEmailAdapter();
    if (email) {
      email.stop();
      logger.info('Email receiver stopped');
    }

    server.close(() => {
      logger.info('HTTP server closed');
      closeDatabase();
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.warn('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  logger.fatal({ error }, 'Fatal error');
  process.exit(1);
});
