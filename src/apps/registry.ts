/**
 * App Registry
 *
 * Central registry that bridges app manifests with the integration system.
 * Provides runtime discovery, configuration-driven loading, and health monitoring.
 *
 * @module apps/registry
 */

import { createLogger } from '@/utils/logger.js';
import type {
  AnyAppManifest,
  AppCategory,
  AIAppManifest,
  ChannelAppManifest,
  PMSAppManifest,
  ConnectionTestResult,
} from './types.js';
import type { AIProvider } from '@/core/interfaces/ai.js';
import type { ChannelAdapter } from '@/core/interfaces/channel.js';
import type { PMSAdapter } from '@/core/interfaces/pms.js';

const log = createLogger('apps:registry');

/**
 * Registry entry status
 */
export type RegistryStatus =
  | 'registered'
  | 'configured'
  | 'initializing'
  | 'active'
  | 'error'
  | 'disabled';

/**
 * Registered app with runtime state
 */
export interface RegisteredApp<T = unknown> {
  manifest: AnyAppManifest;
  status: RegistryStatus;
  instance?: T;
  config?: Record<string, unknown>;
  lastHealthCheck?: Date;
  lastError?: string;
  healthCheckResult?: ConnectionTestResult;
}

/**
 * App Registry class
 *
 * Manages all apps in the system:
 * - Registration of app manifests
 * - Configuration and initialization
 * - Health monitoring
 * - Runtime enable/disable
 */
export class AppRegistry {
  private apps = new Map<string, RegisteredApp>();
  private aiProviders = new Map<string, AIProvider>();
  private channelAdapters = new Map<string, ChannelAdapter>();
  private pmsAdapters = new Map<string, PMSAdapter>();

  constructor() {
    log.debug('App registry initialized');
  }

  /**
   * Register an app manifest
   */
  register(manifest: AnyAppManifest): void {
    if (this.apps.has(manifest.id)) {
      log.warn({ id: manifest.id }, 'App already registered, skipping');
      return;
    }

    this.apps.set(manifest.id, {
      manifest,
      status: 'registered',
    });

    log.info(
      { id: manifest.id, name: manifest.name, category: manifest.category },
      'App registered'
    );
  }

  /**
   * Register multiple app manifests
   */
  registerAll(manifests: AnyAppManifest[]): void {
    for (const manifest of manifests) {
      this.register(manifest);
    }
  }

  /**
   * Configure an app with provided settings
   */
  configure(appId: string, config: Record<string, unknown>): void {
    const ext = this.apps.get(appId);
    if (!ext) {
      throw new Error(`App not found: ${appId}`);
    }

    // Validate required config fields
    const missingFields = ext.manifest.configSchema
      .filter((field) => field.required && config[field.key] === undefined)
      .map((field) => field.key);

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required config fields for ${appId}: ${missingFields.join(', ')}`
      );
    }

    ext.config = config;
    ext.status = 'configured';

    log.info({ appId }, 'App configured');
  }

  /**
   * Initialize an app (create instance)
   */
  async initialize(appId: string): Promise<void> {
    const ext = this.apps.get(appId);
    if (!ext) {
      throw new Error(`App not found: ${appId}`);
    }

    if (!ext.config) {
      throw new Error(`App not configured: ${appId}`);
    }

    ext.status = 'initializing';

    try {
      const manifest = ext.manifest;
      const category = manifest.category;

      switch (category) {
        case 'ai': {
          const aiManifest = manifest as AIAppManifest;
          const provider = aiManifest.createProvider(ext.config);
          this.aiProviders.set(appId, provider);
          ext.instance = provider;
          break;
        }
        case 'channel': {
          const channelManifest = manifest as ChannelAppManifest;
          const adapter = channelManifest.createAdapter(ext.config);
          this.channelAdapters.set(appId, adapter);
          ext.instance = adapter;
          break;
        }
        case 'pms': {
          const pmsManifest = manifest as PMSAppManifest;
          const adapter = pmsManifest.createAdapter(ext.config);
          this.pmsAdapters.set(appId, adapter);
          ext.instance = adapter;
          break;
        }
        case 'tool': {
          // Tools don't have instances - they're just routes and manifests
          // The tool itself is available via its routes
          ext.instance = null;
          break;
        }
      }

      ext.status = 'active';
      log.info({ appId, category }, 'App initialized');
    } catch (error) {
      ext.status = 'error';
      ext.lastError = error instanceof Error ? error.message : String(error);
      log.error({ appId, error: ext.lastError }, 'App initialization failed');
      throw error;
    }
  }

  /**
   * Configure and initialize an app in one step
   */
  async activate(appId: string, config: Record<string, unknown>): Promise<void> {
    this.configure(appId, config);
    await this.initialize(appId);
  }

  /**
   * Disable an app
   */
  disable(appId: string): void {
    const ext = this.apps.get(appId);
    if (!ext) {
      throw new Error(`App not found: ${appId}`);
    }

    // Remove from provider maps
    this.aiProviders.delete(appId);
    this.channelAdapters.delete(appId);
    this.pmsAdapters.delete(appId);

    ext.instance = undefined;
    ext.status = 'disabled';

    log.info({ appId }, 'App disabled');
  }

  /**
   * Reconfigure an app with new settings (hot-reload)
   * This disables the old instance and creates a new one with updated config
   */
  async reconfigure(appId: string, config: Record<string, unknown>): Promise<void> {
    const ext = this.apps.get(appId);
    if (!ext) {
      throw new Error(`App not found: ${appId}`);
    }

    log.info({ appId }, 'Reconfiguring app with new settings');

    // Disable old instance if active
    if (ext.status === 'active' || ext.instance) {
      this.disable(appId);
    }

    // Re-register to reset state (keep manifest)
    ext.status = 'registered';
    delete ext.config;
    delete ext.lastError;

    // Activate with new config
    await this.activate(appId, config);

    log.info({ appId }, 'App reconfigured successfully');
  }

  /**
   * Run health check on an app
   */
  async healthCheck(appId: string): Promise<ConnectionTestResult> {
    const ext = this.apps.get(appId);
    if (!ext) {
      return {
        success: false,
        message: `App not found: ${appId}`,
      };
    }

    if (!ext.instance) {
      return {
        success: false,
        message: 'App not initialized',
      };
    }

    try {
      // Check if instance has testConnection method
      const instance = ext.instance as { testConnection?: () => Promise<ConnectionTestResult> };
      if (typeof instance.testConnection === 'function') {
        const result = await instance.testConnection();
        ext.lastHealthCheck = new Date();
        ext.healthCheckResult = result;

        if (!result.success) {
          ext.lastError = result.message;
        }

        log.debug(
          { appId, success: result.success },
          'Health check completed'
        );

        return result;
      }

      // No testConnection method - assume healthy
      const result: ConnectionTestResult = {
        success: true,
        message: 'App is active (no health check available)',
      };
      ext.lastHealthCheck = new Date();
      ext.healthCheckResult = result;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: ConnectionTestResult = {
        success: false,
        message: `Health check failed: ${message}`,
      };
      ext.lastHealthCheck = new Date();
      ext.healthCheckResult = result;
      ext.lastError = message;

      log.error({ appId, error: message }, 'Health check failed');
      return result;
    }
  }

  /**
   * Run health checks on all active apps
   */
  async healthCheckAll(): Promise<Map<string, ConnectionTestResult>> {
    const results = new Map<string, ConnectionTestResult>();

    for (const [id, ext] of this.apps) {
      if (ext.status === 'active') {
        results.set(id, await this.healthCheck(id));
      }
    }

    return results;
  }

  /**
   * Get app by ID
   */
  get(appId: string): RegisteredApp | undefined {
    return this.apps.get(appId);
  }

  /**
   * Get all registered apps
   */
  getAll(): RegisteredApp[] {
    return Array.from(this.apps.values());
  }

  /**
   * Get apps by category
   */
  getByCategory(category: AppCategory): RegisteredApp[] {
    return this.getAll().filter((ext) => ext.manifest.category === category);
  }

  /**
   * Get active apps by category
   */
  getActiveByCategory(category: AppCategory): RegisteredApp[] {
    return this.getByCategory(category).filter((ext) => ext.status === 'active');
  }

  /**
   * Get an AI provider by app ID
   */
  getAIProvider(appId: string): AIProvider | undefined {
    return this.aiProviders.get(appId);
  }

  /**
   * Get the first active AI provider
   */
  getActiveAIProvider(): AIProvider | undefined {
    for (const [id, ext] of this.apps) {
      if (ext.manifest.category === 'ai' && ext.status === 'active') {
        return this.aiProviders.get(id);
      }
    }
    return undefined;
  }

  /**
   * Get a provider that supports completion
   * Priority: User-configured provider (non-local) > Local fallback (if explicitly configured)
   */
  getCompletionProvider(): AIProvider | undefined {
    // First try user's active AI provider with completion support (not local)
    for (const [id, ext] of this.apps) {
      if (ext.manifest.category === 'ai' && ext.status === 'active' && id !== 'local') {
        const manifest = ext.manifest as AIAppManifest;
        if (manifest.capabilities?.completion) {
          return this.aiProviders.get(id);
        }
      }
    }
    // Fallback to local only if active AND explicitly configured with a completion model
    const localExt = this.apps.get('local');
    if (localExt?.status === 'active' && localExt.config?.completionModel) {
      return this.aiProviders.get('local');
    }
    return undefined;
  }

  /**
   * Get a provider that supports embeddings
   * Priority: User-configured with real embeddings (non-local) > Local fallback (if explicitly configured)
   */
  getEmbeddingProvider(): AIProvider | undefined {
    // First try user's active AI provider with embedding support (not local)
    for (const [id, ext] of this.apps) {
      if (ext.manifest.category === 'ai' && ext.status === 'active' && id !== 'local') {
        const manifest = ext.manifest as AIAppManifest;
        if (manifest.capabilities?.embedding) {
          return this.aiProviders.get(id);
        }
      }
    }
    // Fallback to local only if active AND explicitly configured with an embedding model
    const localExt = this.apps.get('local');
    if (localExt?.status === 'active' && localExt.config?.embeddingModel) {
      return this.aiProviders.get('local');
    }
    return undefined;
  }

  /**
   * Get a channel adapter by app ID
   */
  getChannelAdapter(appId: string): ChannelAdapter | undefined {
    return this.channelAdapters.get(appId);
  }

  /**
   * Get all active channel adapters
   */
  getActiveChannelAdapters(): Map<string, ChannelAdapter> {
    const active = new Map<string, ChannelAdapter>();
    for (const [id, ext] of this.apps) {
      if (ext.manifest.category === 'channel' && ext.status === 'active') {
        const adapter = this.channelAdapters.get(id);
        if (adapter) {
          active.set(id, adapter);
        }
      }
    }
    return active;
  }

  /**
   * Get a PMS adapter by app ID
   */
  getPMSAdapter(appId: string): PMSAdapter | undefined {
    return this.pmsAdapters.get(appId);
  }

  /**
   * Get the first active PMS adapter
   */
  getActivePMSAdapter(): PMSAdapter | undefined {
    for (const [id, ext] of this.apps) {
      if (ext.manifest.category === 'pms' && ext.status === 'active') {
        return this.pmsAdapters.get(id);
      }
    }
    return undefined;
  }

  /**
   * Get status summary for all apps
   */
  getStatusSummary(): Array<{
    id: string;
    name: string;
    category: AppCategory;
    status: RegistryStatus;
    lastHealthCheck?: Date;
    lastError?: string;
  }> {
    return this.getAll().map((ext) => {
      const summary: {
        id: string;
        name: string;
        category: AppCategory;
        status: RegistryStatus;
        lastHealthCheck?: Date;
        lastError?: string;
      } = {
        id: ext.manifest.id,
        name: ext.manifest.name,
        category: ext.manifest.category,
        status: ext.status,
      };
      if (ext.lastHealthCheck) {
        summary.lastHealthCheck = ext.lastHealthCheck;
      }
      if (ext.lastError) {
        summary.lastError = ext.lastError;
      }
      return summary;
    });
  }

  /**
   * Clear all apps (for testing)
   */
  clear(): void {
    this.apps.clear();
    this.aiProviders.clear();
    this.channelAdapters.clear();
    this.pmsAdapters.clear();
    log.debug('App registry cleared');
  }
}

// Singleton instance
let registryInstance: AppRegistry | null = null;

/**
 * Get the global app registry
 */
export function getAppRegistry(): AppRegistry {
  if (!registryInstance) {
    registryInstance = new AppRegistry();
  }
  return registryInstance;
}

/**
 * Reset the app registry (for testing)
 */
export function resetAppRegistry(): void {
  registryInstance?.clear();
  registryInstance = null;
}
