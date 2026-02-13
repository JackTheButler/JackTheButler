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
import { setupWebSocketBridge } from '@/gateway/websocket-bridge.js';
import { scheduler } from '@/services/scheduler.js';
import { appConfigService } from '@/services/app-config.js';
import { resetResponder } from '@/ai/index.js';
import { getAutomationEngine } from '@/automation/index.js';
import { subscribeAutomationToEvents } from '@/automation/event-subscriber.js';

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
    await appConfigService.loadEnabledApps();
    // Reset responder cache so it picks up the newly loaded AI provider
    resetResponder();
    logger.info('Apps loaded from database');
  } catch (error) {
    logger.error({ error }, 'Failed to load apps from database');
  }

  // Auto-activate webchat (built-in, no external dependencies)
  try {
    const { getAppRegistry } = await import('@/apps/index.js');
    const registry = getAppRegistry();
    const webchat = registry.get('channel-webchat');
    if (webchat && webchat.status !== 'active') {
      // Ensure DB config exists so dashboard shows correct status
      const existing = await appConfigService.getAppConfig('channel-webchat');
      if (!existing) {
        await appConfigService.saveAppConfig('channel-webchat', {}, true);
      } else if (existing.enabled) {
        await registry.activate('channel-webchat', existing.config);
      }
      logger.info('WebChat channel auto-activated');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to auto-activate WebChat channel');
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

  // Setup event bridge for real-time dashboard updates
  setupWebSocketBridge();

  // Start listening
  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server listening');
    logger.info({ path: '/ws' }, 'WebSocket server ready');

    // Start background scheduler (PMS sync)
    scheduler.start();
    logger.info('Background scheduler started');

    // Start automation engine
    const automationEngine = getAutomationEngine();
    automationEngine.startScheduler(60000); // Check time-based rules every 60 seconds
    logger.info('Automation engine started');

    // Subscribe automation engine to system events
    subscribeAutomationToEvents();
    logger.info('Automation event subscribers registered');

    // Note: Email is now handled via extensions (Mailgun, SendGrid, Gmail SMTP)
    // Inbound email uses webhooks instead of IMAP polling

    logger.info('Ready! (Phase 20 - Smart Automation)');
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');

    // Stop automation engine
    getAutomationEngine().stopScheduler();
    logger.info('Automation engine stopped');

    // Stop scheduler
    scheduler.stop();
    logger.info('Scheduler stopped');

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
