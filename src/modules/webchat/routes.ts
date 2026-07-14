import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono, type Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { AppError } from '@/core/errors.js';
import { widgetMessageBody } from '@/modules/webchat/schema.js';
import {
  getPublicWidgetConfig,
  getWidgetHistory,
  receiveWidgetMessage,
} from '@/modules/webchat/service.js';

/**
 * PUBLIC, unauthenticated widget surface (mounted outside /api/app/*).
 * Every endpoint is origin-checked in the service against the configured
 * allowlist.
 *
 * Origin resolution: the iframe is same-origin with this API, so its
 * `Origin` header is *our* domain, not the embedding site. The loader (host
 * page) passes the real host via `?host=`; that wins. The `Origin` header is
 * a fallback for direct (non-iframe) callers. Best-effort by design — see
 * docs/ARCHITECTURE.md.
 */
export const webchatRoutes = new Hono();

const origin = (c: Context) => c.req.query('host') ?? c.req.header('origin') ?? null;

webchatRoutes.get('/widget/config', (c) => c.json(getPublicWidgetConfig(origin(c))));

webchatRoutes.get('/widget/messages', (c) => {
  const visitorId = c.req.query('visitorId') ?? '';
  if (!visitorId) throw new AppError('invalid_input', 400);
  return c.json({ messages: getWidgetHistory(origin(c), visitorId) });
});

webchatRoutes.post('/widget/message', async (c) => {
  const parsed = widgetMessageBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(
    receiveWidgetMessage(origin(c), parsed.data.visitorId, parsed.data.content),
    201,
  );
});

// The host-page loader (vanilla; owns visitorId + theme, injects the iframe).
const LOADER = (() => {
  try {
    return readFileSync(resolve(process.cwd(), 'apps/widget/loader.js'), 'utf8');
  } catch {
    return '/* widget loader unavailable */\n';
  }
})();

webchatRoutes.get('/widget.js', (c) =>
  c.body(LOADER, 200, { 'content-type': 'application/javascript; charset=utf-8' }),
);

// The iframe bundle (built by `pnpm build:widget`).
webchatRoutes.get(
  '/widget/app/*',
  serveStatic({
    root: './apps/widget/dist',
    rewriteRequestPath: (p) => p.replace(/^\/widget\/app/, '') || '/',
  }),
);
