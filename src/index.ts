import { serve } from '@hono/node-server';
import { logger } from '@/core/logger.js';
import { config } from '@/config.js';
import { runMigrations } from '@/db/migrate.js';
import { app } from '@/app.js';

/** Process entrypoint: apply migrations, then serve the app. */
runMigrations();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`);
});
