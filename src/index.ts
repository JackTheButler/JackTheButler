import { serve } from '@hono/node-server';
import { logger } from '@/core/logger.js';
import { config } from '@/config.js';
import { runMigrations } from '@/db/migrate.js';
import { app, injectWebSocket } from '@/app.js';

/** Process entrypoint: apply migrations, then serve the app. */
runMigrations();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`);
});
injectWebSocket(server);

/**
 * Graceful shutdown. Without this, `tsx watch` restarts (every save) and
 * Railway deploys leave the old process holding port 3000 — its persistent
 * WebSocket + keep-alive connections never drain, so `close()` alone hangs
 * forever. `closeAllConnections()` force-closes them so the listening socket
 * is released immediately and the next start can bind. The timeout is a
 * last-resort hard exit.
 */
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  (server as { closeAllConnections?: () => void }).closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
