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

const serveDist = serveStatic({ root: DIST });

export function registerSpa<E extends Env>(app: Hono<E>): void {
  // Serve any built file (hashed /assets/*, plus root files the SPA fallback
  // would otherwise swallow: the service worker, manifest.webmanifest, and the
  // PWA/favicon icons). A path is a "file" if its last segment has an
  // extension; extensionless paths are client routes and fall through.
  app.use('*', (c, next) => {
    const { path } = c.req;
    if (SKIP.some((p) => path.startsWith(p))) return next();
    return /\/[^/]+\.[a-zA-Z0-9]+$/.test(path) ? serveDist(c, next) : next();
  });

  // SPA fallback: client-side routes → index.html.
  app.get(
    '*',
    (c, next) => (SKIP.some((p) => c.req.path.startsWith(p)) ? c.notFound() : next()),
    serveStatic({ path: `${DIST}/index.html` }),
  );
}
