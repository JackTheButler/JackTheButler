import type { Env, Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

/**
 * Serve the built dashboard SPA so one process serves API + widget +
 * dashboard from a single origin (the production single-service model;
 * also removes the dev origin split in prod).
 *
 * Mounted LAST. API/widget/health routes are registered earlier and match
 * first; anything else falls here. Unmatched /api,/widget,/health still
 * 404 as before (not the SPA), so API 404s stay JSON.
 */

const DIST = './apps/dashboard/dist';
const SKIP = ['/api', '/widget', '/health'];

export function registerSpa<E extends Env>(app: Hono<E>): void {
  app.use('/assets/*', serveStatic({ root: DIST }));
  app.use('/favicon.ico', serveStatic({ root: DIST }));

  // SPA fallback: client-side routes → index.html.
  app.get(
    '*',
    (c, next) => (SKIP.some((p) => c.req.path.startsWith(p)) ? c.notFound() : next()),
    serveStatic({ path: `${DIST}/index.html` }),
  );
}
