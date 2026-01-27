/**
 * Jack The Butler - Entry Point
 *
 * AI-powered hospitality assistant for hotels.
 */

import { loadConfig, getEnv } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { closeDatabase, isDatabaseHealthy } from '@/db/index.js';

const APP_NAME = 'Jack The Butler';
const VERSION = '0.2.0';

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

  // Phase 2 will add: HTTP server, WebSocket
  // For now, just keep the process alive

  logger.info('Ready! (Phase 1 - Foundation)');

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep process alive for Docker health checks
  // In Phase 2, the HTTP server will keep it alive instead
  await new Promise(() => {});
}

main().catch((error) => {
  logger.fatal({ error }, 'Fatal error');
  process.exit(1);
});
