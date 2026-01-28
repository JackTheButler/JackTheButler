/**
 * Integration Management API Routes
 *
 * Endpoints for managing integrations and their providers.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { integrationConfigService } from '@/services/integration-config.js';
import {
  integrationRegistry,
  getIntegrationDefinition,
  getProviderDefinition,
} from '@/integrations/core/index.js';
import { testAIProviderConnection, type AIProviderType } from '@/integrations/ai/index.js';
import { testWhatsAppConnection, type MetaWhatsAppConfig } from '@/integrations/channels/whatsapp/index.js';
import { testSMSConnection, type SMSProviderType } from '@/integrations/channels/sms/index.js';
import { testEmailConnection, type EmailProviderType } from '@/integrations/channels/email/index.js';
import { createLogger } from '@/utils/logger.js';
import { maskConfig } from '@/utils/crypto.js';
import type { ConnectionTestResult } from '@/integrations/core/types.js';

const log = createLogger('api:integrations');

/**
 * Integration routes
 */
export const integrationRoutes = new Hono();

// ==================
// List Integrations
// ==================

/**
 * GET /api/v1/integrations
 * List all available integrations with their status
 */
integrationRoutes.get('/', async (c) => {
  const integrations = await integrationConfigService.listIntegrations();

  // Transform for API response
  const response = integrations.map((integration) => ({
    id: integration.definition.id,
    name: integration.definition.name,
    category: integration.definition.category,
    description: integration.definition.description,
    icon: integration.definition.icon,
    required: integration.definition.required ?? false,
    multiProvider: integration.definition.multiProvider ?? false,
    providers: integration.providers.map((p) => ({
      id: p.definition.id,
      name: p.definition.name,
      status: p.status,
      enabled: p.config?.enabled ?? false,
      lastChecked: p.config?.lastCheckedAt?.toISOString() ?? null,
      lastError: p.config?.lastError ?? null,
    })),
    activeProvider: integration.activeProvider ?? null,
    status: integration.overallStatus,
  }));

  return c.json({ integrations: response });
});

// ==================
// Get Integration Registry (Static)
// ==================

/**
 * GET /api/v1/integrations/registry
 * Get the static integration registry (available integrations)
 * Note: This must be defined BEFORE /:integrationId to avoid route collision
 */
integrationRoutes.get('/registry', async (c) => {
  return c.json({
    integrations: integrationRegistry.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      description: i.description,
      icon: i.icon,
      required: i.required ?? false,
      multiProvider: i.multiProvider ?? false,
      providers: i.providers.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        docsUrl: p.docsUrl ?? null,
        configSchema: p.configSchema,
      })),
    })),
  });
});

// ==================
// Get Integration Details
// ==================

/**
 * GET /api/v1/integrations/:integrationId
 * Get detailed integration info with config schema
 */
integrationRoutes.get('/:integrationId', async (c) => {
  const { integrationId } = c.req.param();

  const integration = await integrationConfigService.getIntegration(integrationId);
  if (!integration) {
    return c.json({ error: 'Integration not found' }, 404);
  }

  // Include full config schema for each provider
  const response = {
    id: integration.definition.id,
    name: integration.definition.name,
    category: integration.definition.category,
    description: integration.definition.description,
    icon: integration.definition.icon,
    required: integration.definition.required ?? false,
    multiProvider: integration.definition.multiProvider ?? false,
    providers: integration.providers.map((p) => ({
      id: p.definition.id,
      name: p.definition.name,
      description: p.definition.description,
      docsUrl: p.definition.docsUrl ?? null,
      configSchema: p.definition.configSchema,
      status: p.status,
      enabled: p.config?.enabled ?? false,
      config: p.config ? maskConfig(p.config.config) : null,
      lastChecked: p.config?.lastCheckedAt?.toISOString() ?? null,
      lastError: p.config?.lastError ?? null,
    })),
    activeProvider: integration.activeProvider ?? null,
    status: integration.overallStatus,
  };

  return c.json(response);
});

// ==================
// Get Provider Config
// ==================

/**
 * GET /api/v1/integrations/:integrationId/providers/:providerId
 * Get provider config (credentials masked)
 */
integrationRoutes.get('/:integrationId/providers/:providerId', async (c) => {
  const { integrationId, providerId } = c.req.param();

  // Validate integration and provider exist
  const integration = getIntegrationDefinition(integrationId);
  const provider = getProviderDefinition(integrationId, providerId);

  if (!integration || !provider) {
    return c.json({ error: 'Integration or provider not found' }, 404);
  }

  const config = await integrationConfigService.getProviderConfigMasked(integrationId, providerId);

  return c.json({
    integrationId,
    providerId,
    providerName: provider.name,
    configSchema: provider.configSchema,
    config: config
      ? {
          enabled: config.enabled,
          status: config.status,
          config: config.config,
          lastChecked: config.lastCheckedAt?.toISOString() ?? null,
          lastError: config.lastError,
        }
      : null,
  });
});

// ==================
// Update Provider Config
// ==================

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).optional(),
});

/**
 * PUT /api/v1/integrations/:integrationId/providers/:providerId
 * Update provider config
 */
integrationRoutes.put('/:integrationId/providers/:providerId', async (c) => {
  const { integrationId, providerId } = c.req.param();

  // Validate integration and provider exist
  const integration = getIntegrationDefinition(integrationId);
  const provider = getProviderDefinition(integrationId, providerId);

  if (!integration || !provider) {
    return c.json({ error: 'Integration or provider not found' }, 404);
  }

  // Parse and validate body
  const body = await c.req.json();
  const parsed = updateConfigSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
  }

  const { enabled, config } = parsed.data;

  // Get existing config
  const existing = await integrationConfigService.getProviderConfig(integrationId, providerId);

  // Trim string values and filter out masked credentials (contain asterisks)
  const trimmedConfig: Record<string, string | boolean | number> = {};
  if (config) {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        // Skip masked values (contain asterisks) - keep existing value instead
        if (trimmed.includes('*')) {
          continue;
        }
        trimmedConfig[key] = trimmed;
      } else {
        trimmedConfig[key] = value;
      }
    }
  }

  // Merge config if provided
  const newConfig: Record<string, string | boolean | number> = config
    ? { ...(existing?.config ?? {}), ...trimmedConfig }
    : existing?.config ?? {};

  // Save config
  const result = await integrationConfigService.saveProviderConfig(
    integrationId,
    providerId,
    newConfig,
    enabled ?? existing?.enabled ?? false
  );

  log.info({ integrationId, providerId, enabled: result.enabled }, 'Provider config updated');

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
// Delete Provider Config
// ==================

/**
 * DELETE /api/v1/integrations/:integrationId/providers/:providerId
 * Delete provider config
 */
integrationRoutes.delete('/:integrationId/providers/:providerId', async (c) => {
  const { integrationId, providerId } = c.req.param();

  const deleted = await integrationConfigService.deleteProviderConfig(integrationId, providerId);

  if (!deleted) {
    return c.json({ error: 'Provider config not found' }, 404);
  }

  log.info({ integrationId, providerId }, 'Provider config deleted');

  return c.json({ success: true });
});

// ==================
// Test Provider Connection
// ==================

/**
 * POST /api/v1/integrations/:integrationId/providers/:providerId/test
 * Test provider connection
 */
integrationRoutes.post('/:integrationId/providers/:providerId/test', async (c) => {
  const { integrationId, providerId } = c.req.param();

  // Validate integration and provider exist
  const integration = getIntegrationDefinition(integrationId);
  const provider = getProviderDefinition(integrationId, providerId);

  if (!integration || !provider) {
    return c.json({ error: 'Integration or provider not found' }, 404);
  }

  // Get config
  const config = await integrationConfigService.getProviderConfig(integrationId, providerId);
  if (!config) {
    return c.json({ error: 'Provider not configured' }, 400);
  }

  // Test connection based on integration type
  let result: ConnectionTestResult;

  try {
    switch (integrationId) {
      case 'ai':
        result = await testAIProviderConnection(
          providerId as AIProviderType,
          config.config as Record<string, unknown>
        );
        break;

      case 'whatsapp':
        result = await testWhatsAppConnection(config.config as unknown as MetaWhatsAppConfig);
        break;

      case 'sms':
        result = await testSMSConnection(
          providerId as SMSProviderType,
          config.config as Record<string, unknown>
        );
        break;

      case 'email':
        result = await testEmailConnection(
          providerId as EmailProviderType,
          config.config as Record<string, unknown>
        );
        break;

      case 'pms':
        // PMS testing not implemented yet
        result = {
          success: true,
          message: 'PMS connection testing not implemented',
        };
        break;

      case 'webchat':
        // Webchat is built-in, always works
        result = {
          success: true,
          message: 'Web chat is built-in and always available',
        };
        break;

      default:
        result = {
          success: false,
          message: `Connection testing not implemented for ${integrationId}`,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result = {
      success: false,
      message: `Connection test failed: ${message}`,
    };
    log.error({ error, integrationId, providerId }, 'Connection test error');
  }

  // Update provider status
  await integrationConfigService.updateProviderStatus(integrationId, providerId, result);

  log.info(
    { integrationId, providerId, success: result.success, latencyMs: result.latencyMs },
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
// Toggle Provider Enabled
// ==================

/**
 * POST /api/v1/integrations/:integrationId/providers/:providerId/toggle
 * Enable or disable a provider
 */
integrationRoutes.post('/:integrationId/providers/:providerId/toggle', async (c) => {
  const { integrationId, providerId } = c.req.param();

  const body = await c.req.json();
  const enabled = body.enabled === true;

  const result = await integrationConfigService.setProviderEnabled(
    integrationId,
    providerId,
    enabled
  );

  if (!result) {
    return c.json({ error: 'Provider config not found' }, 404);
  }

  log.info({ integrationId, providerId, enabled }, 'Provider toggled');

  return c.json({
    success: true,
    enabled: result.enabled,
    status: result.status,
  });
});

// ==================
// Get Integration Logs
// ==================

/**
 * GET /api/v1/integrations/:integrationId/logs
 * Get integration event logs
 */
integrationRoutes.get('/:integrationId/logs', async (c) => {
  const { integrationId } = c.req.param();
  const providerId = c.req.query('providerId');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);

  const logs = await integrationConfigService.getIntegrationLogs(
    integrationId,
    providerId,
    Math.min(limit, 100)
  );

  return c.json({
    logs: logs.map((log) => ({
      id: log.id,
      providerId: log.providerId,
      eventType: log.eventType,
      status: log.status,
      details: log.details,
      errorMessage: log.errorMessage,
      latencyMs: log.latencyMs,
      createdAt: log.createdAt.toISOString(),
    })),
  });
});
