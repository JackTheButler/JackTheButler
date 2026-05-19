import { Hono } from 'hono';
import { onError } from '@/core/http.js';
import { authRoutes } from '@/modules/auth/routes.js';
import { appsRoutes } from '@/modules/apps/routes.js';
import { requireAuth, type AuthEnv } from '@/modules/auth/middleware.js';

/**
 * Composition root. Builds and returns the Hono app — no side effects, no
 * port binding (that's index.ts). Tests import this directly.
 *
 * Routing convention:
 *  - public:  /health, /api/ping, /api/auth/*
 *  - protected-by-default: everything under /api/app/* requires auth.
 *    New business modules mount here and are authed automatically.
 */
const app = new Hono<AuthEnv>();

app.onError(onError);

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'jane-the-operator', time: new Date().toISOString() }),
);
app.get('/api/ping', (c) => c.json({ message: 'pong' }));

app.route('/api/auth', authRoutes);

app.use('/api/app/*', requireAuth);

// Demo protected route — proves the auth gate. Replaced by real modules.
app.get('/api/app/ping', (c) => c.json({ message: 'pong', user: c.get('user') }));

app.route('/api/app/apps', appsRoutes);

export { app };
