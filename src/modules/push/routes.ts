import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import type { AuthEnv } from '@/modules/auth/middleware.js';
import { subscribeBody, unsubscribeBody } from '@/modules/push/schema.js';
import {
  isPushEnabled,
  vapidPublicKey,
  saveSubscription,
  removeSubscription,
} from '@/modules/push/service.js';

/** Self-service Web Push routes — a staff member manages their own device
 *  subscriptions (all staff; not admin-gated). */
export const pushRoutes = new Hono<AuthEnv>();

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

/** Public VAPID key + whether push is configured — the client needs the key to
 *  subscribe, and uses `enabled` to show/hide the toggle. */
pushRoutes.get('/key', (c) => c.json({ enabled: isPushEnabled(), key: vapidPublicKey() }));

pushRoutes.post('/subscribe', async (c) => {
  if (!isPushEnabled()) throw new AppError('push_disabled', 503);
  const parsed = subscribeBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  saveSubscription(c.get('user').id, parsed.data.subscription, parsed.data.userAgent);
  return c.json({ ok: true }, 201);
});

pushRoutes.post('/unsubscribe', async (c) => {
  const parsed = unsubscribeBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  removeSubscription(parsed.data.endpoint);
  return c.json({ ok: true });
});
