/**
 * App Management API Routes
 *
 * Endpoints for managing apps (AI providers, channels, PMS).
 *
 * @module gateway/routes/apps
 */

import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { appConfigService } from '@/services/app-config.js';
import { getAllManifests, getManifest } from '@/apps/index.js';
import { createLogger } from '@/utils/logger.js';
import { maskConfig } from '@/utils/crypto.js';
import { requireAuth, requirePermission } from '@/gateway/middleware/index.js';
import { PERMISSIONS } from '@/core/permissions/index.js';

const log = createLogger('api:apps');

/**
 * App routes
 */
export const appRoutes = new Hono();

// Apply auth to all routes
appRoutes.use('/*', requireAuth);

// ==================
// List Apps
// ==================

/**
 * GET /api/v1/apps
 * List all available apps with their status
 */
appRoutes.get('/', requirePermission(PERMISSIONS.SETTINGS_VIEW), async (c) => {
  const apps = await appConfigService.listApps();

  // Transform for API response
  const response = apps.map((ext) => ({
    id: ext.manifest.id,
    name: ext.manifest.name,
    category: ext.manifest.category,
    description: ext.manifest.description,
    icon: ext.manifest.icon ?? null,
    version: ext.manifest.version,
    docsUrl: ext.manifest.docsUrl ?? null,
    status: ext.status,
    enabled: ext.config?.enabled ?? false,
    isActive: ext.isActive,
    lastChecked: ext.config?.lastCheckedAt?.toISOString() ?? null,
    lastError: ext.config?.lastError ?? null,
    configSchema: ext.manifest.configSchema,
  }));

  return c.json({ apps: response });
});

/**
 * GET /api/v1/apps/categories
 * List apps grouped by category
 */
appRoutes.get('/categories', requirePermission(PERMISSIONS.SETTINGS_VIEW), async (c) => {
  const groups = await appConfigService.listAppsByCategory();

  return c.json({
    categories: groups.map((g) => ({
      id: g.category,
      label: g.categoryLabel,
      apps: g.apps.map((ext) => ({
        id: ext.manifest.id,
        name: ext.manifest.name,
        description: ext.manifest.description,
        icon: ext.manifest.icon ?? null,
        status: ext.status,
        enabled: ext.config?.enabled ?? false,
        isActive: ext.isActive,
      })),
    })),
  });
});

// ==================
// Get App Registry (Static Manifests)
// ==================

/**
 * GET /api/v1/apps/registry
 * Get the static app registry (available apps)
 */
appRoutes.get('/registry', requirePermission(PERMISSIONS.SETTINGS_VIEW), async (c) => {
  const manifests = getAllManifests();

  return c.json({
    apps: manifests.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      version: m.version,
      description: m.description,
      icon: m.icon ?? null,
      docsUrl: m.docsUrl ?? null,
      configSchema: m.configSchema,
    })),
  });
});

// ==================
// Get App Details
// ==================

/**
 * GET /api/v1/apps/:appId
 * Get detailed app info with config schema
 */
appRoutes.get('/:appId', requirePermission(PERMISSIONS.SETTINGS_VIEW), async (c) => {
  const { appId } = c.req.param();

  const appDetail = await appConfigService.getApp(appId);
  if (!appDetail) {
    return c.json({ error: 'App not found' }, 404);
  }

  const maskedConfig = appDetail.config
    ? maskConfig(appDetail.config.config)
    : null;

  return c.json({
    id: appDetail.manifest.id,
    name: appDetail.manifest.name,
    category: appDetail.manifest.category,
    version: appDetail.manifest.version,
    description: appDetail.manifest.description,
    icon: appDetail.manifest.icon ?? null,
    docsUrl: appDetail.manifest.docsUrl ?? null,
    configSchema: appDetail.manifest.configSchema,
    status: appDetail.status,
    enabled: appDetail.config?.enabled ?? false,
    isActive: appDetail.isActive,
    config: maskedConfig,
    lastChecked: appDetail.config?.lastCheckedAt?.toISOString() ?? null,
    lastError: appDetail.config?.lastError ?? null,
  });
});

// ==================
// Update App Config
// ==================

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).optional(),
});

/**
 * PUT /api/v1/apps/:appId
 * Update app config
 */
appRoutes.put('/:appId', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (c) => {
  const { appId } = c.req.param();

  const manifest = getManifest(appId);
  if (!manifest) {
    return c.json({ error: 'App not found' }, 404);
  }

  const body = await c.req.json();
  const parsed = updateConfigSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
  }

  const { enabled, config } = parsed.data;

  // Get existing config
  const existing = await appConfigService.getAppConfig(appId);

  // Trim string values and filter out masked credentials
  const trimmedConfig: Record<string, string | boolean | number> = {};
  if (config) {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.includes('*')) {
          continue; // Skip masked values
        }
        trimmedConfig[key] = trimmed;
      } else {
        trimmedConfig[key] = value;
      }
    }
  }

  // Merge config
  const newConfig: Record<string, string | boolean | number> = config
    ? { ...(existing?.config ?? {}), ...trimmedConfig }
    : existing?.config ?? {};

  // Auto-generate widget key for webchat on first save
  if (appId === 'channel-webchat' && !newConfig.widgetKey) {
    newConfig.widgetKey = 'wc_' + randomBytes(16).toString('hex');
  }

  // Save config
  const result = await appConfigService.saveAppConfig(
    appId,
    newConfig,
    enabled ?? existing?.enabled ?? false
  );

  log.info({ appId, enabled: result.enabled }, 'App config updated');

  return c.json({
    success: true,
    config: {
      enabled: result.enabled,
      status: result.status,
      config: maskConfig(result.config),
      lastChecked: result.lastCheckedAt?.toISOString() ?? null,
    },
  });
});

// ==================
// Delete App Config
// ==================

/**
 * DELETE /api/v1/apps/:appId
 * Delete app config
 */
appRoutes.delete('/:appId', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (c) => {
  const { appId } = c.req.param();

  const deleted = await appConfigService.deleteAppConfig(appId);

  if (!deleted) {
    return c.json({ error: 'App config not found' }, 404);
  }

  log.info({ appId }, 'App config deleted');

  return c.json({ success: true });
});

// ==================
// Test App Connection
// ==================

/**
 * POST /api/v1/apps/:appId/test
 * Test app connection
 */
appRoutes.post('/:appId/test', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (c) => {
  const { appId } = c.req.param();

  const manifest = getManifest(appId);
  if (!manifest) {
    return c.json({ error: 'App not found' }, 404);
  }

  const config = await appConfigService.getAppConfig(appId);
  if (!config) {
    return c.json({ error: 'App not configured' }, 400);
  }

  const result = await appConfigService.testAppConnection(appId);

  log.info(
    { appId, success: result.success, latencyMs: result.latencyMs },
    'Connection test completed'
  );

  return c.json({
    success: result.success,
    message: result.message,
    details: result.details ?? null,
    latencyMs: result.latencyMs ?? null,
  });
});

// ==================
// Toggle App Enabled
// ==================

/**
 * POST /api/v1/apps/:appId/toggle
 * Enable or disable an app
 */
appRoutes.post('/:appId/toggle', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (c) => {
  const { appId } = c.req.param();

  const body = await c.req.json();
  const enabled = body.enabled === true;

  const result = await appConfigService.setAppEnabled(appId, enabled);

  if (!result) {
    return c.json({ error: 'App config not found' }, 404);
  }

  log.info({ appId, enabled }, 'App toggled');

  return c.json({
    success: true,
    enabled: result.enabled,
    status: result.status,
  });
});

// ==================
// Get App Logs
// ==================

/**
 * GET /api/v1/apps/:appId/logs
 * Get app event logs
 */
appRoutes.get('/:appId/logs', requirePermission(PERMISSIONS.SETTINGS_VIEW), async (c) => {
  const { appId } = c.req.param();
  const limit = parseInt(c.req.query('limit') ?? '50', 10);

  const logs = await appConfigService.getAppLogs(
    appId,
    Math.min(limit, 100)
  );

  return c.json({
    logs: logs.map((log) => ({
      id: log.id,
      appId: log.appId,
      eventType: log.eventType,
      status: log.status,
      details: log.details,
      errorMessage: log.errorMessage,
      latencyMs: log.latencyMs,
      createdAt: log.createdAt.toISOString(),
    })),
  });
});

