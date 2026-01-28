/**
 * Integration Config Service
 *
 * Manages integration configurations stored in the database.
 * Handles encryption of sensitive credentials.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db, integrationConfigs, integrationLogs } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { encryptObject, decryptObject, maskConfig } from '@/utils/crypto.js';
import {
  integrationRegistry,
  getIntegrationDefinition,
  getProviderDefinition,
  type IntegrationDefinition,
  type ProviderDefinition,
  type IntegrationStatus,
  type ConnectionTestResult,
} from '@/integrations/core/index.js';

const log = createLogger('service:integration-config');

/**
 * Provider configuration (stored encrypted in DB)
 */
export interface ProviderConfig {
  [key: string]: string | boolean | number;
}

/**
 * Integration config record
 */
export interface IntegrationConfigRecord {
  id: string;
  integrationId: string;
  providerId: string;
  enabled: boolean;
  status: IntegrationStatus;
  config: ProviderConfig;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Integration with status summary
 */
export interface IntegrationWithStatus {
  definition: IntegrationDefinition;
  providers: Array<{
    definition: ProviderDefinition;
    config?: IntegrationConfigRecord;
    status: IntegrationStatus;
  }>;
  activeProvider?: string;
  overallStatus: IntegrationStatus;
}

/**
 * Integration Config Service
 */
export class IntegrationConfigService {
  /**
   * Get all integrations with their status
   */
  async listIntegrations(): Promise<IntegrationWithStatus[]> {
    // Get all configs from database
    const configs = await db.select().from(integrationConfigs).all();

    // Build config map for quick lookup
    const configMap = new Map<string, typeof configs[0]>();
    for (const config of configs) {
      configMap.set(`${config.integrationId}:${config.providerId}`, config);
    }

    // Build response for each integration
    return integrationRegistry.map((integration) => {
      const providers = integration.providers.map((provider) => {
        const config = configMap.get(`${integration.id}:${provider.id}`);

        let status: IntegrationStatus = 'not_configured';
        let configRecord: IntegrationConfigRecord | undefined;

        if (config) {
          status = config.status as IntegrationStatus;
          configRecord = this.dbToRecord(config);
        }

        return {
          definition: provider,
          ...(configRecord !== undefined && { config: configRecord }),
          status,
        };
      });

      // Determine active provider and overall status
      const enabledProviders = providers.filter((p) => p.config?.enabled);
      const connectedProvider = enabledProviders.find((p) => p.status === 'connected');
      const errorProvider = enabledProviders.find((p) => p.status === 'error');

      let overallStatus: IntegrationStatus;
      if (connectedProvider) {
        overallStatus = 'connected';
      } else if (errorProvider) {
        overallStatus = 'error';
      } else if (enabledProviders.length > 0) {
        overallStatus = 'configured';
      } else {
        overallStatus = 'not_configured';
      }

      return {
        definition: integration,
        providers,
        ...(connectedProvider && { activeProvider: connectedProvider.definition.id }),
        overallStatus,
      };
    });
  }

  /**
   * Get a specific integration with full details
   */
  async getIntegration(integrationId: string): Promise<IntegrationWithStatus | null> {
    const integration = getIntegrationDefinition(integrationId);
    if (!integration) {
      return null;
    }

    const configs = await db
      .select()
      .from(integrationConfigs)
      .where(eq(integrationConfigs.integrationId, integrationId))
      .all();

    const configMap = new Map<string, typeof configs[0]>();
    for (const config of configs) {
      configMap.set(config.providerId, config);
    }

    const providers = integration.providers.map((provider) => {
      const config = configMap.get(provider.id);

      let status: IntegrationStatus = 'not_configured';
      let configRecord: IntegrationConfigRecord | undefined;

      if (config) {
        status = config.status as IntegrationStatus;
        configRecord = this.dbToRecord(config);
      }

      return {
        definition: provider,
        ...(configRecord !== undefined && { config: configRecord }),
        status,
      };
    });

    const enabledProviders = providers.filter((p) => p.config?.enabled);
    const connectedProvider = enabledProviders.find((p) => p.status === 'connected');
    const errorProvider = enabledProviders.find((p) => p.status === 'error');

    let overallStatus: IntegrationStatus;
    if (connectedProvider) {
      overallStatus = 'connected';
    } else if (errorProvider) {
      overallStatus = 'error';
    } else if (enabledProviders.length > 0) {
      overallStatus = 'configured';
    } else {
      overallStatus = 'not_configured';
    }

    return {
      definition: integration,
      providers,
      ...(connectedProvider && { activeProvider: connectedProvider.definition.id }),
      overallStatus,
    };
  }

  /**
   * Get provider config (with credentials decrypted)
   */
  async getProviderConfig(
    integrationId: string,
    providerId: string
  ): Promise<IntegrationConfigRecord | null> {
    const config = await db
      .select()
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.integrationId, integrationId),
          eq(integrationConfigs.providerId, providerId)
        )
      )
      .get();

    if (!config) {
      return null;
    }

    return this.dbToRecord(config);
  }

  /**
   * Get provider config with masked credentials (for API responses)
   */
  async getProviderConfigMasked(
    integrationId: string,
    providerId: string
  ): Promise<IntegrationConfigRecord | null> {
    const config = await this.getProviderConfig(integrationId, providerId);
    if (!config) {
      return null;
    }

    return {
      ...config,
      config: maskConfig(config.config),
    };
  }

  /**
   * Create or update provider config
   */
  async saveProviderConfig(
    integrationId: string,
    providerId: string,
    config: ProviderConfig,
    enabled: boolean = false
  ): Promise<IntegrationConfigRecord> {
    // Validate integration and provider exist
    const integration = getIntegrationDefinition(integrationId);
    const provider = getProviderDefinition(integrationId, providerId);

    if (!integration || !provider) {
      throw new Error(`Invalid integration/provider: ${integrationId}/${providerId}`);
    }

    // Check if config already exists
    const existing = await db
      .select()
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.integrationId, integrationId),
          eq(integrationConfigs.providerId, providerId)
        )
      )
      .get();

    const encryptedConfig = encryptObject(config);
    const now = new Date().toISOString();

    if (existing) {
      // Update existing
      await db
        .update(integrationConfigs)
        .set({
          config: encryptedConfig,
          enabled,
          status: 'configured',
          updatedAt: now,
        })
        .where(eq(integrationConfigs.id, existing.id))
        .run();

      log.info({ integrationId, providerId }, 'Provider config updated');

      // Log the config change
      await this.logEvent(integrationId, providerId, 'config_changed', 'success', {
        enabled,
      });

      return this.dbToRecord({
        ...existing,
        config: encryptedConfig,
        enabled,
        status: 'configured',
        updatedAt: now,
      });
    } else {
      // Create new
      const id = generateId('integration');
      const newConfig = {
        id,
        integrationId,
        providerId,
        enabled,
        status: 'configured' as const,
        config: encryptedConfig,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(integrationConfigs).values(newConfig).run();

      log.info({ integrationId, providerId, id }, 'Provider config created');

      // Log the config change
      await this.logEvent(integrationId, providerId, 'config_changed', 'success', {
        action: 'created',
        enabled,
      });

      return this.dbToRecord(newConfig);
    }
  }

  /**
   * Enable or disable a provider
   */
  async setProviderEnabled(
    integrationId: string,
    providerId: string,
    enabled: boolean
  ): Promise<IntegrationConfigRecord | null> {
    const config = await db
      .select()
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.integrationId, integrationId),
          eq(integrationConfigs.providerId, providerId)
        )
      )
      .get();

    if (!config) {
      return null;
    }

    const now = new Date().toISOString();
    const newStatus = enabled ? config.status : 'disabled';

    await db
      .update(integrationConfigs)
      .set({
        enabled,
        status: newStatus,
        updatedAt: now,
      })
      .where(eq(integrationConfigs.id, config.id))
      .run();

    log.info({ integrationId, providerId, enabled }, 'Provider enabled state changed');

    return this.dbToRecord({
      ...config,
      enabled,
      status: newStatus,
      updatedAt: now,
    });
  }

  /**
   * Update provider status after connection test
   */
  async updateProviderStatus(
    integrationId: string,
    providerId: string,
    result: ConnectionTestResult
  ): Promise<IntegrationConfigRecord | null> {
    const config = await db
      .select()
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.integrationId, integrationId),
          eq(integrationConfigs.providerId, providerId)
        )
      )
      .get();

    if (!config) {
      return null;
    }

    const now = new Date().toISOString();
    const status: IntegrationStatus = result.success ? 'connected' : 'error';

    await db
      .update(integrationConfigs)
      .set({
        status,
        lastCheckedAt: now,
        ...(result.success ? {} : { lastError: result.message }),
        updatedAt: now,
      })
      .where(eq(integrationConfigs.id, config.id))
      .run();

    // Log the connection test
    await this.logEvent(
      integrationId,
      providerId,
      'connection_test',
      result.success ? 'success' : 'failed',
      result.details,
      result.success ? undefined : result.message,
      result.latencyMs
    );

    log.info(
      { integrationId, providerId, success: result.success, latencyMs: result.latencyMs },
      'Provider status updated after connection test'
    );

    return this.dbToRecord({
      ...config,
      status,
      lastCheckedAt: now,
      lastError: result.success ? null : result.message,
      updatedAt: now,
    });
  }

  /**
   * Delete a provider config
   */
  async deleteProviderConfig(
    integrationId: string,
    providerId: string
  ): Promise<boolean> {
    const result = await db
      .delete(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.integrationId, integrationId),
          eq(integrationConfigs.providerId, providerId)
        )
      )
      .run();

    if (result.changes > 0) {
      log.info({ integrationId, providerId }, 'Provider config deleted');
      return true;
    }

    return false;
  }

  /**
   * Get integration logs
   */
  async getIntegrationLogs(
    integrationId: string,
    providerId?: string,
    limit: number = 50
  ): Promise<Array<{
    id: string;
    integrationId: string;
    providerId: string;
    eventType: string;
    status: string;
    details: Record<string, unknown> | null;
    errorMessage: string | null;
    latencyMs: number | null;
    createdAt: Date;
  }>> {
    let query = db
      .select()
      .from(integrationLogs)
      .where(eq(integrationLogs.integrationId, integrationId))
      .orderBy(desc(integrationLogs.createdAt))
      .limit(limit);

    if (providerId) {
      query = db
        .select()
        .from(integrationLogs)
        .where(
          and(
            eq(integrationLogs.integrationId, integrationId),
            eq(integrationLogs.providerId, providerId)
          )
        )
        .orderBy(desc(integrationLogs.createdAt))
        .limit(limit);
    }

    const logs = await query.all();

    return logs.map((log) => ({
      id: log.id,
      integrationId: log.integrationId,
      providerId: log.providerId,
      eventType: log.eventType,
      status: log.status,
      details: log.details ? JSON.parse(log.details) : null,
      errorMessage: log.errorMessage,
      latencyMs: log.latencyMs,
      createdAt: new Date(log.createdAt),
    }));
  }

  /**
   * Log an integration event
   */
  async logEvent(
    integrationId: string,
    providerId: string,
    eventType: string,
    status: 'success' | 'failed',
    details?: Record<string, unknown>,
    errorMessage?: string,
    latencyMs?: number
  ): Promise<void> {
    const id = generateId('integrationLog');
    const now = new Date().toISOString();

    await db
      .insert(integrationLogs)
      .values({
        id,
        integrationId,
        providerId,
        eventType,
        status,
        details: details ? JSON.stringify(details) : null,
        errorMessage: errorMessage ?? null,
        latencyMs: latencyMs ?? null,
        createdAt: now,
      })
      .run();
  }

  /**
   * Convert database record to typed record
   */
  private dbToRecord(config: {
    id: string;
    integrationId: string;
    providerId: string;
    enabled: boolean;
    status: string;
    config: string;
    lastCheckedAt?: string | null;
    lastError?: string | null;
    createdAt: string;
    updatedAt: string;
  }): IntegrationConfigRecord {
    let decryptedConfig: ProviderConfig = {};
    try {
      if (config.config && config.config !== '{}') {
        decryptedConfig = decryptObject<ProviderConfig>(config.config);
      }
    } catch {
      log.warn(
        { integrationId: config.integrationId, providerId: config.providerId },
        'Failed to decrypt config, may be unencrypted'
      );
      // Try parsing as plain JSON (for migration)
      try {
        decryptedConfig = JSON.parse(config.config);
      } catch {
        // Ignore, use empty config
      }
    }

    return {
      id: config.id,
      integrationId: config.integrationId,
      providerId: config.providerId,
      enabled: config.enabled,
      status: config.status as IntegrationStatus,
      config: decryptedConfig,
      lastCheckedAt: config.lastCheckedAt ? new Date(config.lastCheckedAt) : null,
      lastError: config.lastError ?? null,
      createdAt: new Date(config.createdAt),
      updatedAt: new Date(config.updatedAt),
    };
  }
}

/**
 * Default service instance
 */
export const integrationConfigService = new IntegrationConfigService();
