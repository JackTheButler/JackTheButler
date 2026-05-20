import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import { configBody } from '@/modules/apps/schema.js';
import {
  listApps,
  getApp,
  saveConfig,
  setEnabled,
  checkApp,
} from '@/modules/apps/service.js';

/** Thin HTTP adapter. Validate → call service → serialize. No logic here. */
export const appsRoutes = new Hono();

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

appsRoutes.get('/', (c) => c.json({ apps: listApps() }));

appsRoutes.get('/:id', (c) => c.json(getApp(c.req.param('id'))));

appsRoutes.put('/:id/config', async (c) => {
  const parsed = configBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(await saveConfig(c.req.param('id'), parsed.data.config));
});

appsRoutes.post('/:id/enable', (c) => {
  setEnabled(c.req.param('id'), true);
  return c.json(getApp(c.req.param('id')));
});

appsRoutes.post('/:id/disable', (c) => {
  setEnabled(c.req.param('id'), false);
  return c.json(getApp(c.req.param('id')));
});

appsRoutes.post('/:id/check', async (c) => c.json(await checkApp(c.req.param('id'))));
