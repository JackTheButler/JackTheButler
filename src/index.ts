import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from '@/lib/logger.js';

const app = new Hono();

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'jane-the-operator', time: new Date().toISOString() }),
);

app.get('/api/ping', (c) => c.json({ message: 'pong' }));

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`);
});

export { app };
