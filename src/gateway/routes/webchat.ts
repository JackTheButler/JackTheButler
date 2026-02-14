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
import { appConfigService } from '@/services/app-config.js';
import { validateBody } from '../middleware/validator.js';
import { UnauthorizedError } from '@/errors/index.js';
import { createLogger } from '@/utils/logger.js';
import { resolveLocale, getWidgetStrings } from '@/locales/webchat/index.js';
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
 * Domain allowlist middleware — validate Origin header on all webchat REST endpoints.
 * If allowedDomains is configured, only requests from those domains are allowed.
 */
webchatRouter.use('*', async (c, next) => {
  const appConfig = await appConfigService.getAppConfig('channel-webchat');
  const allowedDomainsStr = (appConfig?.config?.allowedDomains as string)?.trim();
  if (!allowedDomainsStr) return next();

  const origin = c.req.header('Origin') ?? '';
  let originHost = '';
  try { originHost = new URL(origin).hostname.toLowerCase(); } catch { /* invalid origin */ }
  const allowedDomains = allowedDomainsStr.split(',').map((d) => d.trim().toLowerCase());
  if (!allowedDomains.some((d) => originHost === d || originHost.endsWith(`.${d}`))) {
    log.warn({ origin }, 'Rejected webchat request from unauthorized domain');
    return c.json({ error: 'Unauthorized domain' }, 403);
  }
  return next();
});

/**
 * GET /api/v1/webchat/config
 * Returns widget appearance config (colors, bot name, logo).
 * No auth — widget runs on hotel's public site.
 * Optional ?key=wc_xxx for widget key validation.
 */
webchatRouter.get('/config', async (c) => {
  const appConfig = await appConfigService.getAppConfig('channel-webchat');
  const locale = resolveLocale(c.req.query('locale') ?? undefined);

  // Defaults for backward compat (no config saved yet)
  const defaults = {
    theme: 'light' as string,
    buttonIcon: 'chat' as string,
    botName: 'Hotel Concierge',
    primaryColor: '#0084ff',
    headerBackground: '#1a1a2e',
    logoUrl: null as string | null,
    welcomeMessage: null as string | null,
  };

  const localeFields = { locale, strings: getWidgetStrings(locale) };

  if (!appConfig) {
    return c.json({ ...defaults, ...localeFields });
  }

  // Activation gate — disabled means unavailable
  if (!appConfig.enabled) {
    return c.json({ error: 'Widget not available' }, 503);
  }

  // Widget key validation (if key is configured)
  const widgetKey = appConfig.config?.widgetKey as string | undefined;
  const queryKey = c.req.query('key');
  if (widgetKey && queryKey && queryKey !== widgetKey) {
    return c.json({ error: 'Invalid widget key' }, 403);
  }

  const cfg = appConfig.config ?? {};
  return c.json({
    theme: (cfg.theme as string) || defaults.theme,
    buttonIcon: (cfg.buttonIcon as string) || defaults.buttonIcon,
    botName: (cfg.botName as string) || defaults.botName,
    primaryColor: (cfg.primaryColor as string) || defaults.primaryColor,
    headerBackground: (cfg.headerBackground as string) || defaults.headerBackground,
    logoUrl: (cfg.logoUrl as string) || defaults.logoUrl,
    welcomeMessage: (cfg.welcomeMessage as string) || defaults.welcomeMessage,
    ...localeFields,
  });
});

/**
 * GET /api/v1/webchat/actions
 * Returns action definitions for the widget.
 * No session required — widget needs this on first load.
 */
webchatRouter.get('/actions', async (c) => {
  const locale = resolveLocale(c.req.query('locale') ?? undefined);
  const actions = await webchatActionService.getEnabledActions(locale);
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
