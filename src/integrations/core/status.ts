/**
 * Integration Status Service
 *
 * Tracks connection status and manages provider instances.
 */

import { createLogger } from '@/utils/logger.js';
import type { IntegrationStatus, ProviderInstance, ConnectionTestResult } from './types.js';
import { getIntegrationDefinition, getProviderDefinition } from './registry.js';

const log = createLogger('integrations:status');

/**
 * In-memory status cache (backed by database)
 * Maps integrationId:providerId to ProviderInstance
 */
const statusCache = new Map<string, ProviderInstance>();

/**
 * Get cache key for a provider
 */
function getCacheKey(integrationId: string, providerId: string): string {
  return `${integrationId}:${providerId}`;
}

/**
 * Get provider instance from cache
 */
export function getProviderInstance(
  integrationId: string,
  providerId: string
): ProviderInstance | undefined {
  return statusCache.get(getCacheKey(integrationId, providerId));
}

/**
 * Get all configured provider instances for an integration
 */
export function getProviderInstances(integrationId: string): ProviderInstance[] {
  const instances: ProviderInstance[] = [];
  for (const [key, instance] of statusCache.entries()) {
    if (key.startsWith(`${integrationId}:`)) {
      instances.push(instance);
    }
  }
  return instances;
}

/**
 * Get the active (enabled + connected) provider for an integration
 */
export function getActiveProvider(integrationId: string): ProviderInstance | undefined {
  const instances = getProviderInstances(integrationId);
  return instances.find((i) => i.enabled && i.status === 'connected');
}

/**
 * Update provider instance in cache
 */
export function updateProviderInstance(instance: ProviderInstance): void {
  const key = getCacheKey(instance.integrationId, instance.providerId);
  statusCache.set(key, instance);
  log.debug(
    { integrationId: instance.integrationId, providerId: instance.providerId, status: instance.status },
    'Provider instance updated'
  );
}

/**
 * Update provider status after a connection test
 */
export function updateProviderStatus(
  integrationId: string,
  providerId: string,
  result: ConnectionTestResult
): ProviderInstance | undefined {
  const instance = getProviderInstance(integrationId, providerId);
  if (!instance) {
    log.warn({ integrationId, providerId }, 'Cannot update status: provider not configured');
    return undefined;
  }

  const updatedInstance: ProviderInstance = {
    ...instance,
    status: result.success ? 'connected' : 'error',
    lastCheckedAt: new Date(),
    updatedAt: new Date(),
    ...(result.success ? {} : { lastError: result.message }),
  };

  updateProviderInstance(updatedInstance);
  return updatedInstance;
}

/**
 * Initialize a provider instance with configuration
 */
export function initializeProviderInstance(
  integrationId: string,
  providerId: string,
  config: Record<string, string | boolean | number>,
  enabled: boolean = false
): ProviderInstance {
  const integration = getIntegrationDefinition(integrationId);
  const provider = getProviderDefinition(integrationId, providerId);

  if (!integration || !provider) {
    throw new Error(`Unknown integration/provider: ${integrationId}/${providerId}`);
  }

  const instance: ProviderInstance = {
    id: `${integrationId}-${providerId}`,
    integrationId,
    providerId,
    enabled,
    status: 'configured',
    config,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  updateProviderInstance(instance);
  log.info(
    { integrationId, providerId, enabled },
    'Provider instance initialized'
  );

  return instance;
}

/**
 * Enable or disable a provider
 */
export function setProviderEnabled(
  integrationId: string,
  providerId: string,
  enabled: boolean
): ProviderInstance | undefined {
  const instance = getProviderInstance(integrationId, providerId);
  if (!instance) {
    log.warn({ integrationId, providerId }, 'Cannot enable/disable: provider not configured');
    return undefined;
  }

  const updatedInstance: ProviderInstance = {
    ...instance,
    enabled,
    status: enabled ? instance.status : 'disabled',
    updatedAt: new Date(),
  };

  updateProviderInstance(updatedInstance);
  log.info({ integrationId, providerId, enabled }, 'Provider enabled state changed');

  return updatedInstance;
}

/**
 * Get integration status summary
 */
export function getIntegrationStatusSummary(): Array<{
  integrationId: string;
  integrationName: string;
  category: string;
  activeProvider?: string;
  status: IntegrationStatus;
}> {
  const { integrationRegistry } = require('./registry.js');

  return integrationRegistry.map((integration: { id: string; name: string; category: string }) => {
    const instances = getProviderInstances(integration.id);
    const activeProvider = instances.find((i) => i.enabled && i.status === 'connected');
    const hasError = instances.some((i) => i.enabled && i.status === 'error');
    const hasConfigured = instances.some((i) => i.status !== 'not_configured');

    let status: IntegrationStatus;
    if (activeProvider) {
      status = 'connected';
    } else if (hasError) {
      status = 'error';
    } else if (hasConfigured) {
      status = 'configured';
    } else {
      status = 'not_configured';
    }

    return {
      integrationId: integration.id,
      integrationName: integration.name,
      category: integration.category,
      activeProvider: activeProvider?.providerId,
      status,
    };
  });
}

/**
 * Clear all cached status (for testing)
 */
export function clearStatusCache(): void {
  statusCache.clear();
  log.debug('Status cache cleared');
}
