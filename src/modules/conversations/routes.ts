import { Hono, type Context } from 'hono';
import { AppError } from '@/core/errors.js';
import type { AuthEnv } from '@/modules/auth/middleware.js';
import { ingestBody, replyBody, statusQuery } from '@/modules/conversations/schema.js';
import {
  getConversation,
  handback,
  ingestInboundMessage,
  listConversations,
  reply,
  setStatus,
  takeover,
} from '@/modules/conversations/service.js';

/** Thin HTTP adapter. Validate → call service → serialize. No logic here. */
export const conversationRoutes = new Hono<AuthEnv>();

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

conversationRoutes.get('/', (c) => {
  const parsed = statusQuery.safeParse(c.req.query('status') || undefined);
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json({ conversations: listConversations(parsed.data) });
});

conversationRoutes.get('/:id', (c) => c.json(getConversation(c.req.param('id'))));

conversationRoutes.post('/:id/reply', async (c) => {
  const parsed = replyBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(reply(c.req.param('id'), c.get('user').id, parsed.data.content));
});

conversationRoutes.post('/:id/takeover', (c) =>
  c.json(takeover(c.req.param('id'), c.get('user').id)),
);

conversationRoutes.post('/:id/handback', (c) => c.json(handback(c.req.param('id'))));

conversationRoutes.post('/:id/close', (c) => c.json(setStatus(c.req.param('id'), 'closed')));

conversationRoutes.post('/:id/reopen', (c) => c.json(setStatus(c.req.param('id'), 'open')));

// Dev driver now; the public webchat path reuses ingestInboundMessage in slice 3.
conversationRoutes.post('/ingest', async (c) => {
  const parsed = ingestBody.safeParse(await body(c));
  if (!parsed.success) throw new AppError('invalid_input', 400);
  return c.json(ingestInboundMessage(parsed.data), 201);
});
