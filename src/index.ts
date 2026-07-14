import { serve } from '@hono/node-server';
import { logger } from '@/core/logger.js';
import { config } from '@/config.js';
import { runMigrations } from '@/db/migrate.js';
import { app, injectWebSocket } from '@/app.js';
import { startScheduler, stopScheduler } from '@/core/scheduler.js';
import { autoCloseIdleConversations } from '@/modules/conversations/service.js';
import { backfillEpisodeIds, refreshEpisodes } from '@/modules/analytics/projection.js';

/** Process entrypoint: apply migrations, then serve the app. */
runMigrations();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`);
});
injectWebSocket(server);

// Recurring background work (single replica). Both tasks are idempotent and
// run an initial catch-up tick on boot. Tick cadence + windows are config
// (production defaults; override via env for local testing). See
// docs/CONVERSATIONS.md.
startScheduler([
  {
    name: 'inactivity-auto-close',
    intervalMs: config.schedulerTickMs,
    run: () => {
      const n = autoCloseIdleConversations();
      if (n) logger.info({ closed: n }, 'auto-closed idle conversations');
    },
  },
  {
    name: 'episode-projection',
    intervalMs: config.schedulerTickMs,
    run: () => {
      backfillEpisodeIds();
      const n = refreshEpisodes();
      if (n) logger.info({ materialized: n }, 'projected episodes');
    },
  },
]);

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
  stopScheduler();
  (server as { closeAllConnections?: () => void }).closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
