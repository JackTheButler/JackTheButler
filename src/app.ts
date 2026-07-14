import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { onError } from '@/core/http.js';
import { authRoutes } from '@/modules/auth/routes.js';
import { analyticsRoutes } from '@/modules/analytics/routes.js';
import { appsRoutes } from '@/modules/apps/routes.js';
import { assistantRoutes } from '@/modules/assistant/routes.js';
import { businessRoutes } from '@/modules/business/routes.js';
import { conversationRoutes } from '@/modules/conversations/routes.js';
import { knowledgeRoutes } from '@/modules/knowledge/routes.js';
import { staffRoutes } from '@/modules/staff/routes.js';
import { statusRoutes } from '@/modules/status/routes.js';
import { accountRoutes } from '@/modules/account/routes.js';
import { pushRoutes } from '@/modules/push/routes.js';
import { registerPushNotifications } from '@/modules/push/notifications.js';
import { jobRoutes } from '@/core/jobs.js';
import { webchatRoutes } from '@/modules/webchat/routes.js';
import { registerWebchatSocket } from '@/modules/webchat/gateway.js';
import { registerDashboardSocket } from '@/core/realtime.js';
import { registerSpa } from '@/core/spa.js';
import { requireAuth, type AuthEnv } from '@/modules/auth/middleware.js';

/**
 * Composition root. Builds and returns the Hono app — no side effects, no
 * port binding (that's index.ts). Tests import this directly.
 *
 * Routing convention:
 *  - public:  /health, /api/ping, /api/auth/*, /widget/* + /widget.js
 *  - protected-by-default: everything under /api/app/* requires auth.
 *    New business modules mount here and are authed automatically.
 */
const app = new Hono<AuthEnv>();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

app.onError(onError);

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'jane-the-operator', time: new Date().toISOString() }),
);
app.get('/api/ping', (c) => c.json({ message: 'pong' }));

app.route('/api/auth', authRoutes);

// Public widget surface (origin-checked in the service, not by auth).
app.route('/', webchatRoutes);
registerWebchatSocket(app, upgradeWebSocket);

app.use('/api/app/*', requireAuth);

// Authed dashboard event channel — guarded by the requireAuth wildcard above.
registerDashboardSocket(app, upgradeWebSocket);

// Demo protected route — proves the auth gate. Replaced by real modules.
app.get('/api/app/ping', (c) => c.json({ message: 'pong', user: c.get('user') }));

app.route('/api/app/analytics', analyticsRoutes);
app.route('/api/app/apps', appsRoutes);
app.route('/api/app/assistant', assistantRoutes);
app.route('/api/app/business', businessRoutes);
app.route('/api/app/conversations', conversationRoutes);
app.route('/api/app/knowledge', knowledgeRoutes);
app.route('/api/app/staff', staffRoutes);
app.route('/api/app/status', statusRoutes);
app.route('/api/app/account', accountRoutes);
app.route('/api/app/push', pushRoutes);
app.route('/api/app/jobs', jobRoutes);

// Subscribe push notifications to domain events (idempotent).
registerPushNotifications();

// Last: serve the built dashboard SPA (single-origin production model).
registerSpa(app);

export { app, injectWebSocket };
