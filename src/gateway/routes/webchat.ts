/**
 * WebChat Routes
 *
 * REST endpoints for webchat actions (form submissions, verification).
 * These use session-token auth (not JWT) — the Bearer token is the
 * raw session token validated by webchatSessionService.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { webchatActionService } from '@/services/webchat-action.js';
import { webchatSessionService } from '@/services/webchat-session.js';
import { validateBody } from '../middleware/validator.js';
import { UnauthorizedError } from '@/errors/index.js';
import { createLogger } from '@/utils/logger.js';
import type { MiddlewareHandler } from 'hono';

const log = createLogger('routes:webchat');

// ============================================
// Session Token Auth Middleware
// ============================================

/**
 * Require a valid webchat session token.
 * Extracts the token from Authorization: Bearer <session-token>,
 * validates it via webchatSessionService, and sets sessionToken on context.
 */
const requireSession: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  const session = await webchatSessionService.validate(token);

  if (!session) {
    throw new UnauthorizedError('Invalid or expired session');
  }

  c.set('sessionToken', token);
  c.set('sessionId', session.id);
  await next();
};

// ============================================
// Schemas
// ============================================

const actionBodySchema = z.record(z.string(), z.string());

// ============================================
// Router
// ============================================

type Variables = {
  sessionToken: string;
  sessionId: string;
  validatedBody: unknown;
};

const webchatRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /api/v1/webchat/actions
 * Returns action definitions for the widget.
 * No session required — widget needs this on first load.
 */
webchatRouter.get('/actions', (c) => {
  const actions = webchatActionService.getActions();
  return c.json({ actions });
});

/**
 * POST /api/v1/webchat/actions/:actionId
 * Execute an action (form submission).
 * Requires valid session token in Authorization header.
 */
webchatRouter.post(
  '/actions/:actionId',
  requireSession,
  validateBody(actionBodySchema),
  async (c) => {
    const actionId = c.req.param('actionId');
    const sessionToken = c.get('sessionToken');
    const input = c.get('validatedBody') as Record<string, string>;

    log.debug({ actionId, sessionId: c.get('sessionId') }, 'Action submission');

    try {
      const result = await webchatActionService.execute(actionId, sessionToken, input);

      const status = result.success ? 200 : 400;
      return c.json(result, status);
    } catch (error) {
      log.error({ error, actionId, sessionId: c.get('sessionId') }, 'Action execution failed');
      throw error;
    }
  },
);

export { webchatRouter };
