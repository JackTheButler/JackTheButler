/**
 * Extension Config Service
 *
 * Manages extension configurations stored in the database.
 * Bridges the dashboard UI with the ExtensionRegistry for runtime activation.
 *
 * @module services/extension-config
 */

import { eq, and, desc } from 'drizzle-orm';
import { db, integrationConfigs, integrationLogs } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { encryptObject, decryptObject, maskConfig } from '@/utils/crypto.js';
import {
  getExtensionRegistry,
  getAllManifests,
  getManifest,
  type AnyExtensionManifest,
  type ExtensionCategory,
} from '@/extensions/index.js';
import type { ConnectionTestResult } from '@/extensions/types.js';
import { resetResponder } from '@/pipeline/responder.js';

const log = createLogger('service:extension-config');

/**
 * Extension status (matches database status column)
 */
export type ExtensionStatus =
  | 'not_configured'
  | 'configured'
  | 'connected'
  | 'error'
  | 'disabled';

/**
 * Provider configuration (stored encrypted in DB)
 */
export interface ProviderConfig {
  [key: string]: string | boolean | number;
}

/**
 * Extension config record from database
 */
export interface ExtensionConfigRecord {
  id: string;
  extensionId: string;
  providerId: string; // Legacy field, same as extensionId for new extensions
  enabled: boolean;
  status: ExtensionStatus;
  config: ProviderConfig;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extension with status for API responses
 */
export interface ExtensionWithStatus {
  manifest: AnyExtensionManifest;
  config?: ExtensionConfigRecord;
  status: ExtensionStatus;
  isActive: boolean;
}

/**
 * Extension group (for UI categories)
 */
export interface ExtensionGroup {
  category: ExtensionCategory;
  categoryLabel: string;
  extensions: ExtensionWithStatus[];
}

/**
 * Category labels for UI
 *
 * Note: 'tool' category is excluded as tools are built-in features
 * accessed via the sidebar menu, not configurable extensions.
 */
const categoryLabels: Record<Exclude<ExtensionCategory, 'tool'>, string> = {
  ai: 'AI Providers',
  channel: 'Communication Channels',
  pms: 'Property Management',
};

/**
 * Extension Config Service
 *
 * Manages extension configuration lifecycle:
 * - Lists available extensions from manifests
 * - Stores/retrieves config from database
 * - Activates/deactivates extensions in registry
 */
export class ExtensionConfigService {
  /**
   * Get all extensions with their status
   */
  async listExtensions(): Promise<ExtensionWithStatus[]> {
    const manifests = getAllManifests();
    const configs = await db.select().from(integrationConfigs).all();
    const registry = getExtensionRegistry();

    // Build config map for quick lookup
    const configMap = new Map<string, (typeof configs)[0]>();
    for (const config of configs) {
      // Support both old format (integrationId:providerId) and new (extensionId)
      configMap.set(`${config.integrationId}:${config.providerId}`, config);
      configMap.set(config.providerId, config);
    }

    return manifests.map((manifest) => {
      // Try to find config by extension ID or legacy format
      const config =
        configMap.get(manifest.id) ||
        configMap.get(`${this.getLegacyIntegrationId(manifest)}:${manifest.id}`);

      const registeredExt = registry.get(manifest.id);
      const isActive = registeredExt?.status === 'active';

      let status: ExtensionStatus = 'not_configured';
      let configRecord: ExtensionConfigRecord | undefined;

      if (config) {
        status = config.status as ExtensionStatus;
        configRecord = this.dbToRecord(config);
      }

      return {
        manifest,
        ...(configRecord && { config: configRecord }),
        status,
        isActive,
      };
    });
  }

  /**
   * Get extensions grouped by category
   */
  async listExtensionsByCategory(): Promise<ExtensionGroup[]> {
    const extensions = await this.listExtensions();

    // Only include configurable extension categories (not tools)
    const groups: Record<Exclude<ExtensionCategory, 'tool'>, ExtensionWithStatus[]> = {
      ai: [],
      channel: [],
      pms: [],
    };

    for (const ext of extensions) {
      // Skip tools - they're accessed via sidebar menu, not Extensions page
      if (ext.manifest.category === 'tool') continue;
      groups[ext.manifest.category as Exclude<ExtensionCategory, 'tool'>].push(ext);
    }

    return Object.entries(groups)
      .filter(([, exts]) => exts.length > 0)
      .map(([category, extensions]) => ({
        category: category as ExtensionCategory,
        categoryLabel: categoryLabels[category as Exclude<ExtensionCategory, 'tool'>],
        extensions,
      }));
  }

  /**
   * Get a specific extension with full details
   */
  async getExtension(extensionId: string): Promise<ExtensionWithStatus | null> {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      return null;
    }

    const config = await this.getExtensionConfig(extensionId);
    const registry = getExtensionRegistry();
    const registeredExt = registry.get(extensionId);
    const isActive = registeredExt?.status === 'active';

    let status: ExtensionStatus = 'not_configured';
    if (config) {
      status = config.status;
    }

    return {
      manifest,
      ...(config && { config }),
      status,
      isActive,
    };
  }

  /**
   * Get extension config (with credentials decrypted)
   */
  async getExtensionConfig(extensionId: string): Promise<ExtensionConfigRecord | null> {
    // Try new format first, then legacy
    let config = await db
      .select()
      .from(integrationConfigs)
      .where(eq(integrationConfigs.providerId, extensionId))
      .get();

    if (!config) {
      // Try legacy format
      const manifest = getManifest(extensionId);
      if (manifest) {
        const legacyIntegrationId = this.getLegacyIntegrationId(manifest);
        config = await db
          .select()
          .from(integrationConfigs)
          .where(
            and(
              eq(integrationConfigs.integrationId, legacyIntegrationId),
              eq(integrationConfigs.providerId, extensionId)
            )
          )
          .get();
      }
    }

    if (!config) {
      return null;
    }

    return this.dbToRecord(config);
  }

  /**
   * Get extension config with masked credentials (for API responses)
   */
  async getExtensionConfigMasked(extensionId: string): Promise<ExtensionConfigRecord | null> {
    const config = await this.getExtensionConfig(extensionId);
    if (!config) {
      return null;
    }

    return {
      ...config,
      config: maskConfig(config.config),
    };
  }

  /**
   * Save extension config and optionally activate it
   */
  async saveExtensionConfig(
    extensionId: string,
    config: ProviderConfig,
    enabled: boolean = false
  ): Promise<ExtensionConfigRecord> {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      throw new Error(`Unknown extension: ${extensionId}`);
    }

    // Use legacy integration ID for database storage (backward compatibility)
    const legacyIntegrationId = this.getLegacyIntegrationId(manifest);

    // Check if config already exists
    const existing = await db
      .select()
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.integrationId, legacyIntegrationId),
          eq(integrationConfigs.providerId, extensionId)
        )
      )
      .get();

    const encryptedConfig = encryptObject(config);
    const now = new Date().toISOString();

    let record: ExtensionConfigRecord;

    if (existing) {
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

      log.info({ extensionId }, 'Extension config updated');

      await this.logEvent(extensionId, 'config_changed', 'success', { enabled });

      record = this.dbToRecord({
        ...existing,
        config: encryptedConfig,
        enabled,
        status: 'configured',
        updatedAt: now,
      });
    } else {
      const id = generateId('integration');
      const newConfig = {
        id,
        integrationId: legacyIntegrationId,
        providerId: extensionId,
        enabled,
        status: 'configured' as const,
        config: encryptedConfig,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(integrationConfigs).values(newConfig).run();

      log.info({ extensionId, id }, 'Extension config created');

      await this.logEvent(extensionId, 'config_changed', 'success', {
        action: 'created',
        enabled,
      });

      record = this.dbToRecord(newConfig);
    }

    // If enabled, try to activate in registry
    if (enabled) {
      await this.activateExtension(extensionId, config);
    }

    return record;
  }

  /**
   * Enable or disable an extension
   */
  async setExtensionEnabled(
    extensionId: string,
    enabled: boolean
  ): Promise<ExtensionConfigRecord | null> {
    const configRecord = await this.getExtensionConfig(extensionId);
    if (!configRecord) {
      return null;
    }

    const manifest = getManifest(extensionId);
    if (!manifest) {
      return null;
    }

    const legacyIntegrationId = this.getLegacyIntegrationId(manifest);
    const now = new Date().toISOString();
    const newStatus: ExtensionStatus = enabled ? 'configured' : 'disabled';

    await db
      .update(integrationConfigs)
      .set({
        enabled,
        status: newStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(integrationConfigs.integrationId, legacyIntegrationId),
          eq(integrationConfigs.providerId, extensionId)
        )
      )
      .run();

    log.info({ extensionId, enabled }, 'Extension enabled state changed');

    // Activate or deactivate in registry
    const registry = getExtensionRegistry();
    if (enabled) {
      await this.activateExtension(extensionId, configRecord.config);
    } else {
      try {
        registry.disable(extensionId);
      } catch {
        // Extension might not be in registry
      }
    }

    return {
      ...configRecord,
      enabled,
      status: newStatus,
      updatedAt: new Date(now),
    };
  }

  /**
   * Test extension connection
   */
  async testExtensionConnection(extensionId: string): Promise<ConnectionTestResult> {
    const configRecord = await this.getExtensionConfig(extensionId);
    if (!configRecord) {
      return {
        success: false,
        message: 'Extension not configured',
      };
    }

    const registry = getExtensionRegistry();

    // Ensure extension is registered
    const manifest = getManifest(extensionId);
    if (manifest && !registry.get(extensionId)) {
      registry.register(manifest);
    }

    // Try to activate if not already active
    const ext = registry.get(extensionId);
    if (!ext || ext.status !== 'active') {
      try {
        await registry.activate(extensionId, configRecord.config);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Failed to initialize: ${message}`,
        };
      }
    }

    // Run health check
    const result = await registry.healthCheck(extensionId);

    // Update status in database
    await this.updateExtensionStatus(extensionId, result);

    return result;
  }

  /**
   * Update extension status after connection test
   */
  async updateExtensionStatus(
    extensionId: string,
    result: ConnectionTestResult
  ): Promise<ExtensionConfigRecord | null> {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      return null;
    }

    const legacyIntegrationId = this.getLegacyIntegrationId(manifest);
    const config = await db
      .select()
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.integrationId, legacyIntegrationId),
          eq(integrationConfigs.providerId, extensionId)
        )
      )
      .get();

    if (!config) {
      return null;
    }

    const now = new Date().toISOString();
    const status: ExtensionStatus = result.success ? 'connected' : 'error';

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

    await this.logEvent(
      extensionId,
      'connection_test',
      result.success ? 'success' : 'failed',
      result.details,
      result.success ? undefined : result.message,
      result.latencyMs
    );

    log.info(
      { extensionId, success: result.success, latencyMs: result.latencyMs },
      'Extension status updated'
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
   * Delete extension config
   */
  async deleteExtensionConfig(extensionId: string): Promise<boolean> {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      return false;
    }

    const legacyIntegrationId = this.getLegacyIntegrationId(manifest);

    // Disable in registry first
    const registry = getExtensionRegistry();
    try {
      registry.disable(extensionId);
    } catch {
      // Extension might not be in registry
    }

    const result = await db
      .delete(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.integrationId, legacyIntegrationId),
          eq(integrationConfigs.providerId, extensionId)
        )
      )
      .run();

    if (result.changes > 0) {
      log.info({ extensionId }, 'Extension config deleted');
      return true;
    }

    return false;
  }

  /**
   * Get extension logs
   */
  async getExtensionLogs(
    extensionId: string,
    limit: number = 50
  ): Promise<
    Array<{
      id: string;
      extensionId: string;
      eventType: string;
      status: string;
      details: Record<string, unknown> | null;
      errorMessage: string | null;
      latencyMs: number | null;
      createdAt: Date;
    }>
  > {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      return [];
    }

    const legacyIntegrationId = this.getLegacyIntegrationId(manifest);

    const logs = await db
      .select()
      .from(integrationLogs)
      .where(
        and(
          eq(integrationLogs.integrationId, legacyIntegrationId),
          eq(integrationLogs.providerId, extensionId)
        )
      )
      .orderBy(desc(integrationLogs.createdAt))
      .limit(Math.min(limit, 100))
      .all();

    return logs.map((log) => ({
      id: log.id,
      extensionId: log.providerId,
      eventType: log.eventType,
      status: log.status,
      details: log.details ? JSON.parse(log.details) : null,
      errorMessage: log.errorMessage,
      latencyMs: log.latencyMs,
      createdAt: new Date(log.createdAt),
    }));
  }

  /**
   * Load all enabled extensions from database into registry
   */
  async loadEnabledExtensions(): Promise<void> {
    const registry = getExtensionRegistry();

    // First, register all manifests
    const manifests = getAllManifests();
    registry.registerAll(manifests);

    // Load enabled configs from database
    const configs = await db
      .select()
      .from(integrationConfigs)
      .where(eq(integrationConfigs.enabled, true))
      .all();

    for (const config of configs) {
      const extensionId = config.providerId;
      const manifest = getManifest(extensionId);

      if (!manifest) {
        log.warn({ extensionId }, 'Enabled extension not found in manifests');
        continue;
      }

      try {
        const decryptedConfig = this.dbToRecord(config).config;
        await registry.activate(extensionId, decryptedConfig);
        log.info({ extensionId }, 'Extension loaded from database');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error({ extensionId, error: message }, 'Failed to load extension');
      }
    }
  }

  /**
   * Activate an extension in the registry
   */
  private async activateExtension(
    extensionId: string,
    config: ProviderConfig
  ): Promise<void> {
    const registry = getExtensionRegistry();
    const manifest = getManifest(extensionId);

    if (!manifest) {
      throw new Error(`Unknown extension: ${extensionId}`);
    }

    // Ensure registered
    if (!registry.get(extensionId)) {
      registry.register(manifest);
    }

    try {
      const ext = registry.get(extensionId);

      // If already active, reconfigure to pick up new settings (hot-reload)
      if (ext && ext.status === 'active') {
        await registry.reconfigure(extensionId, config);
        log.info({ extensionId }, 'Extension reconfigured (hot-reload)');
      } else {
        await registry.activate(extensionId, config);
        log.info({ extensionId }, 'Extension activated');
      }

      // Reset responder cache if AI extension was activated
      // so it picks up the new provider
      if (manifest.category === 'ai') {
        resetResponder();
        log.info({ extensionId }, 'Responder cache reset for AI provider change');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ extensionId, error: message }, 'Failed to activate extension');
      throw error;
    }
  }

  /**
   * Log an extension event
   */
  private async logEvent(
    extensionId: string,
    eventType: string,
    status: 'success' | 'failed',
    details?: Record<string, unknown>,
    errorMessage?: string,
    latencyMs?: number
  ): Promise<void> {
    const manifest = getManifest(extensionId);
    const legacyIntegrationId = manifest
      ? this.getLegacyIntegrationId(manifest)
      : extensionId;

    const id = generateId('integrationLog');
    const now = new Date().toISOString();

    await db
      .insert(integrationLogs)
      .values({
        id,
        integrationId: legacyIntegrationId,
        providerId: extensionId,
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
   * Get legacy integration ID for backward compatibility
   */
  private getLegacyIntegrationId(manifest: AnyExtensionManifest): string {
    // Map extension category to legacy integration IDs
    switch (manifest.category) {
      case 'ai':
        return 'ai';
      case 'channel':
        // Map specific channels
        if (manifest.id.startsWith('whatsapp')) return 'whatsapp';
        if (manifest.id.startsWith('sms')) return 'sms';
        if (manifest.id.startsWith('email')) return 'email';
        return 'channel';
      case 'pms':
        return 'pms';
      case 'tool':
        // Tools shouldn't be in the extension config system, but handle for safety
        return 'tool';
    }
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
  }): ExtensionConfigRecord {
    let decryptedConfig: ProviderConfig = {};
    try {
      if (config.config && config.config !== '{}') {
        decryptedConfig = decryptObject<ProviderConfig>(config.config);
      }
    } catch {
      log.warn({ extensionId: config.providerId }, 'Failed to decrypt config');
      try {
        decryptedConfig = JSON.parse(config.config);
      } catch {
        // Ignore, use empty config
      }
    }

    return {
      id: config.id,
      extensionId: config.providerId,
      providerId: config.providerId,
      enabled: config.enabled,
      status: config.status as ExtensionStatus,
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
export const extensionConfigService = new ExtensionConfigService();
