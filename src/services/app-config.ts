/**
 * App Config Service
 *
 * Manages app configurations stored in the database.
 * Bridges the dashboard UI with the AppRegistry for runtime activation.
 *
 * @module services/app-config
 */

import { eq, and, desc } from 'drizzle-orm';
import { db, appConfigs, appLogs } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { encryptObject, decryptObject, maskConfig } from '@/utils/crypto.js';
import {
  getAppRegistry,
  getAllManifests,
  getManifest,
  type AnyAppManifest,
  type AppCategory,
} from '@/apps/index.js';
import type { ConnectionTestResult } from '@/apps/types.js';
import { resetResponder } from '@/ai/index.js';

const log = createLogger('service:app-config');

/**
 * App status (matches database status column)
 */
export type AppStatus =
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
 * App config record from database
 */
export interface AppConfigRecord {
  id: string;
  extensionId: string;
  providerId: string;
  enabled: boolean;
  status: AppStatus;
  config: ProviderConfig;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * App with status for API responses
 */
export interface AppWithStatus {
  manifest: AnyAppManifest;
  config?: AppConfigRecord;
  status: AppStatus;
  isActive: boolean;
}

/**
 * App group (for UI categories)
 */
export interface AppGroup {
  category: AppCategory;
  categoryLabel: string;
  apps: AppWithStatus[];
}

/**
 * Category labels for UI
 *
 * Note: 'tool' category is excluded as tools are built-in features
 * accessed via the sidebar menu, not configurable apps.
 */
const categoryLabels: Record<Exclude<AppCategory, 'tool'>, string> = {
  ai: 'AI Providers',
  channel: 'Communication Channels',
  pms: 'Property Management',
};

/**
 * App Config Service
 *
 * Manages app configuration lifecycle:
 * - Lists available apps from manifests
 * - Stores/retrieves config from database
 * - Activates/deactivates extensions in registry
 */
export class AppConfigService {
  /**
   * Get all apps with their status
   */
  async listApps(): Promise<AppWithStatus[]> {
    const manifests = getAllManifests();
    const configs = await db.select().from(appConfigs).all();
    const registry = getAppRegistry();

    // Build config map for quick lookup
    const configMap = new Map<string, (typeof configs)[0]>();
    for (const config of configs) {
      configMap.set(`${config.appId}:${config.providerId}`, config);
      configMap.set(config.providerId, config);
    }

    return manifests.map((manifest) => {
      const config =
        configMap.get(manifest.id) ||
        configMap.get(`${this.getAppId(manifest)}:${manifest.id}`);

      const registeredExt = registry.get(manifest.id);
      const isActive = registeredExt?.status === 'active';

      let status: AppStatus = 'not_configured';
      let configRecord: AppConfigRecord | undefined;

      if (config) {
        status = config.status as AppStatus;
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
   * Get apps grouped by category
   */
  async listAppsByCategory(): Promise<AppGroup[]> {
    const apps = await this.listApps();

    // Only include configurable app categories (not tools)
    const groups: Record<Exclude<AppCategory, 'tool'>, AppWithStatus[]> = {
      ai: [],
      channel: [],
      pms: [],
    };

    for (const app of apps) {
      // Skip tools - they're accessed via sidebar menu, not Apps page
      if (app.manifest.category === 'tool') continue;
      groups[app.manifest.category as Exclude<AppCategory, 'tool'>].push(app);
    }

    return Object.entries(groups)
      .filter(([, apps]) => apps.length > 0)
      .map(([category, apps]) => ({
        category: category as AppCategory,
        categoryLabel: categoryLabels[category as Exclude<AppCategory, 'tool'>],
        apps,
      }));
  }

  /**
   * Get a specific app with full details
   */
  async getApp(extensionId: string): Promise<AppWithStatus | null> {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      return null;
    }

    const config = await this.getAppConfig(extensionId);
    const registry = getAppRegistry();
    const registeredExt = registry.get(extensionId);
    const isActive = registeredExt?.status === 'active';

    let status: AppStatus = 'not_configured';
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
   * Get app config (with credentials decrypted)
   */
  async getAppConfig(extensionId: string): Promise<AppConfigRecord | null> {
    // Try by providerId first
    let config = await db
      .select()
      .from(appConfigs)
      .where(eq(appConfigs.providerId, extensionId))
      .get();

    if (!config) {
      const manifest = getManifest(extensionId);
      if (manifest) {
        const appId = this.getAppId(manifest);
        config = await db
          .select()
          .from(appConfigs)
          .where(
            and(
              eq(appConfigs.appId, appId),
              eq(appConfigs.providerId, extensionId)
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
   * Get app config with masked credentials (for API responses)
   */
  async getAppConfigMasked(extensionId: string): Promise<AppConfigRecord | null> {
    const config = await this.getAppConfig(extensionId);
    if (!config) {
      return null;
    }

    return {
      ...config,
      config: maskConfig(config.config),
    };
  }

  /**
   * Save app config and optionally activate it
   */
  async saveAppConfig(
    extensionId: string,
    config: ProviderConfig,
    enabled: boolean = false
  ): Promise<AppConfigRecord> {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      throw new Error(`Unknown extension: ${extensionId}`);
    }

    const appId = this.getAppId(manifest);

    // Check if config already exists
    const existing = await db
      .select()
      .from(appConfigs)
      .where(
        and(
          eq(appConfigs.appId, appId),
          eq(appConfigs.providerId, extensionId)
        )
      )
      .get();

    const encryptedConfig = encryptObject(config);
    const now = new Date().toISOString();

    let record: AppConfigRecord;

    if (existing) {
      await db
        .update(appConfigs)
        .set({
          config: encryptedConfig,
          enabled,
          status: 'configured',
          updatedAt: now,
        })
        .where(eq(appConfigs.id, existing.id))
        .run();

      log.info({ extensionId }, 'App config updated');

      await this.logEvent(extensionId, 'config_changed', 'success', { enabled });

      record = this.dbToRecord({
        ...existing,
        config: encryptedConfig,
        enabled,
        status: 'configured',
        updatedAt: now,
      });
    } else {
      const id = generateId('app');
      const newConfig = {
        id,
        appId,
        providerId: extensionId,
        enabled,
        status: 'configured' as const,
        config: encryptedConfig,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(appConfigs).values(newConfig).run();

      log.info({ extensionId, id }, 'App config created');

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
   * Enable or disable an app
   */
  async setAppEnabled(
    extensionId: string,
    enabled: boolean
  ): Promise<AppConfigRecord | null> {
    const configRecord = await this.getAppConfig(extensionId);
    if (!configRecord) {
      return null;
    }

    const manifest = getManifest(extensionId);
    if (!manifest) {
      return null;
    }

    const appId = this.getAppId(manifest);
    const now = new Date().toISOString();
    const newStatus: AppStatus = enabled ? 'configured' : 'disabled';

    await db
      .update(appConfigs)
      .set({
        enabled,
        status: newStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(appConfigs.appId, appId),
          eq(appConfigs.providerId, extensionId)
        )
      )
      .run();

    log.info({ extensionId, enabled }, 'App enabled state changed');

    // Activate or deactivate in registry
    const registry = getAppRegistry();
    if (enabled) {
      await this.activateExtension(extensionId, configRecord.config);
    } else {
      try {
        registry.disable(extensionId);
      } catch {
        // Extension might not be in registry
      }
      // Reset responder cache when disabling an AI provider
      // so the next request picks up the new active provider
      if (manifest.category === 'ai') {
        resetResponder();
        log.info({ extensionId }, 'Responder cache reset after disabling AI provider');
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
   * Test app connection
   */
  async testAppConnection(extensionId: string): Promise<ConnectionTestResult> {
    const configRecord = await this.getAppConfig(extensionId);
    if (!configRecord) {
      return {
        success: false,
        message: 'App not configured',
      };
    }

    const registry = getAppRegistry();

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
    await this.updateAppStatus(extensionId, result);

    return result;
  }

  /**
   * Update app status after connection test
   */
  async updateAppStatus(
    extensionId: string,
    result: ConnectionTestResult
  ): Promise<AppConfigRecord | null> {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      return null;
    }

    const appId = this.getAppId(manifest);
    const config = await db
      .select()
      .from(appConfigs)
      .where(
        and(
          eq(appConfigs.appId, appId),
          eq(appConfigs.providerId, extensionId)
        )
      )
      .get();

    if (!config) {
      return null;
    }

    const now = new Date().toISOString();
    const status: AppStatus = result.success ? 'connected' : 'error';

    await db
      .update(appConfigs)
      .set({
        status,
        lastCheckedAt: now,
        ...(result.success ? {} : { lastError: result.message }),
        updatedAt: now,
      })
      .where(eq(appConfigs.id, config.id))
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
      'App status updated'
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
   * Delete app config
   */
  async deleteAppConfig(extensionId: string): Promise<boolean> {
    const manifest = getManifest(extensionId);
    if (!manifest) {
      return false;
    }

    const appId = this.getAppId(manifest);

    // Disable in registry first
    const registry = getAppRegistry();
    try {
      registry.disable(extensionId);
    } catch {
      // Extension might not be in registry
    }

    const result = await db
      .delete(appConfigs)
      .where(
        and(
          eq(appConfigs.appId, appId),
          eq(appConfigs.providerId, extensionId)
        )
      )
      .run();

    if (result.changes > 0) {
      log.info({ extensionId }, 'App config deleted');
      return true;
    }

    return false;
  }

  /**
   * Get app logs
   */
  async getAppLogs(
    extensionId: string,
    limit: number = 50
  ): Promise<
    Array<{
      id: string;
      appId: string;
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

    const resolvedAppId = this.getAppId(manifest);

    const logs = await db
      .select()
      .from(appLogs)
      .where(
        and(
          eq(appLogs.appId, resolvedAppId),
          eq(appLogs.providerId, extensionId)
        )
      )
      .orderBy(desc(appLogs.createdAt))
      .limit(Math.min(limit, 100))
      .all();

    return logs.map((log) => ({
      id: log.id,
      appId: log.providerId,
      eventType: log.eventType,
      status: log.status,
      details: log.details ? JSON.parse(log.details) : null,
      errorMessage: log.errorMessage,
      latencyMs: log.latencyMs,
      createdAt: new Date(log.createdAt),
    }));
  }

  /**
   * Load all enabled apps from database into registry
   */
  async loadEnabledApps(): Promise<void> {
    const registry = getAppRegistry();

    // First, register all manifests
    const manifests = getAllManifests();
    registry.registerAll(manifests);

    // Load enabled configs from database
    const configs = await db
      .select()
      .from(appConfigs)
      .where(eq(appConfigs.enabled, true))
      .all();

    for (const config of configs) {
      const extensionId = config.providerId;
      const manifest = getManifest(extensionId);

      if (!manifest) {
        log.warn({ extensionId }, 'Enabled app not found in manifests');
        continue;
      }

      try {
        const decryptedConfig = this.dbToRecord(config).config;
        await registry.activate(extensionId, decryptedConfig);
        log.info({ extensionId }, 'App loaded from database');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error({ extensionId, error: message }, 'Failed to load app');
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
    const registry = getAppRegistry();
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
   * Log an app event
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
    const appId = manifest
      ? this.getAppId(manifest)
      : extensionId;

    const id = generateId('appLog');
    const now = new Date().toISOString();

    await db
      .insert(appLogs)
      .values({
        id,
        appId,
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
   * Get app ID from manifest category
   */
  private getAppId(manifest: AnyAppManifest): string {
    switch (manifest.category) {
      case 'ai':
        return 'ai';
      case 'channel':
        if (manifest.id.startsWith('whatsapp')) return 'whatsapp';
        if (manifest.id.startsWith('sms')) return 'sms';
        if (manifest.id.startsWith('email')) return 'email';
        return 'channel';
      case 'pms':
        return 'pms';
      case 'tool':
        return 'tool';
    }
  }

  /**
   * Convert database record to typed record
   */
  private dbToRecord(config: {
    id: string;
    appId: string;
    providerId: string;
    enabled: boolean;
    status: string;
    config: string;
    lastCheckedAt?: string | null;
    lastError?: string | null;
    createdAt: string;
    updatedAt: string;
  }): AppConfigRecord {
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
      status: config.status as AppStatus,
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
export const appConfigService = new AppConfigService();
