/**
 * Public Configuration Routes
 *
 * Runtime configuration exposed to the frontend before authentication.
 * All endpoints here are public (no auth required).
 */

import { Hono } from 'hono';
import { authSettingsService } from '@/services/auth-settings.js';
import { isDemo } from '@/config/index.js';
import { getVersion } from '@/config/version.js';

const configRoutes = new Hono();

/**
 * GET /config/public
 * Returns runtime configuration needed by the frontend before login.
 */
configRoutes.get('/public', async (c) => {
  const authSettings = await authSettingsService.get();

  return c.json({
    demoMode: isDemo(),
    registrationEnabled: authSettings.registrationEnabled,
    version: getVersion(),
  });
});

export { configRoutes };
