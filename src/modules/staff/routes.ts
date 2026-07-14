import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import { requireAdmin, type AuthEnv } from '@/modules/auth/middleware.js';
import { inviteBody, roleBody } from '@/modules/staff/schema.js';
import {
  cancelInvite,
  getInviteToken,
  inviteStaff,
  listStaff,
  setRole,
  setStatus,
} from '@/modules/staff/service.js';

/** Staff management. Admin-only (agents can't reach the Team area). */
export const staffRoutes = new Hono<AuthEnv>();
staffRoutes.use('*', requireAdmin);

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

staffRoutes.get('/', (c) => c.json({ members: listStaff() }));

// Re-fetch a pending invite's token so the admin can re-share the accept link.
staffRoutes.get('/:id/invite-token', (c) => c.json({ token: getInviteToken(c.req.param('id')) }));

staffRoutes.post('/invite', async (c) => {
  const parsed = inviteBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  // No email yet: return the token so the dashboard can build a copyable
  // accept link. The dashboard owns URL construction (knows its origin).
  const { member, token } = inviteStaff(parsed.data.email, parsed.data.role);
  return c.json({ member, token }, 201);
});

staffRoutes.post('/:id/role', async (c) => {
  const parsed = roleBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(setRole(c.req.param('id'), parsed.data.role));
});

staffRoutes.post('/:id/disable', (c) => c.json(setStatus(c.req.param('id'), 'disabled')));
staffRoutes.post('/:id/enable', (c) => c.json(setStatus(c.req.param('id'), 'active')));

// Cancel a pending invite — hard-deletes the not-yet-joined row.
staffRoutes.delete('/:id', (c) => {
  cancelInvite(c.req.param('id'));
  return c.json({ ok: true });
});
