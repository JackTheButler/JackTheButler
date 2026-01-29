/**
 * Extension Registry
 *
 * Central registry that bridges extension manifests with the integration system.
 * Provides runtime discovery, configuration-driven loading, and health monitoring.
 *
 * @module extensions/registry
 */

import { createLogger } from '@/utils/logger.js';
import type {
  AnyExtensionManifest,
  ExtensionCategory,
  AIExtensionManifest,
  ChannelExtensionManifest,
  PMSExtensionManifest,
  ConnectionTestResult,
} from './types.js';
import type { AIProvider } from '@/core/interfaces/ai.js';
import type { ChannelAdapter } from '@/core/interfaces/channel.js';
import type { PMSAdapter } from '@/core/interfaces/pms.js';

const log = createLogger('extensions:registry');

/**
 * Extension instance state
 */
export type ExtensionStatus =
  | 'registered'
  | 'configured'
  | 'initializing'
  | 'active'
  | 'error'
  | 'disabled';

/**
 * Registered extension with runtime state
 */
export interface RegisteredExtension<T = unknown> {
  manifest: AnyExtensionManifest;
  status: ExtensionStatus;
  instance?: T;
  config?: Record<string, unknown>;
  lastHealthCheck?: Date;
  lastError?: string;
  healthCheckResult?: ConnectionTestResult;
}

/**
 * Extension Registry class
 *
 * Manages all extensions in the system:
 * - Registration of extension manifests
 * - Configuration and initialization
 * - Health monitoring
 * - Runtime enable/disable
 */
export class ExtensionRegistry {
  private extensions = new Map<string, RegisteredExtension>();
  private aiProviders = new Map<string, AIProvider>();
  private channelAdapters = new Map<string, ChannelAdapter>();
  private pmsAdapters = new Map<string, PMSAdapter>();

  constructor() {
    log.debug('Extension registry initialized');
  }

  /**
   * Register an extension manifest
   */
  register(manifest: AnyExtensionManifest): void {
    if (this.extensions.has(manifest.id)) {
      log.warn({ id: manifest.id }, 'Extension already registered, skipping');
      return;
    }

    this.extensions.set(manifest.id, {
      manifest,
      status: 'registered',
    });

    log.info(
      { id: manifest.id, name: manifest.name, category: manifest.category },
      'Extension registered'
    );
  }

  /**
   * Register multiple extension manifests
   */
  registerAll(manifests: AnyExtensionManifest[]): void {
    for (const manifest of manifests) {
      this.register(manifest);
    }
  }

  /**
   * Configure an extension with provided settings
   */
  configure(extensionId: string, config: Record<string, unknown>): void {
    const ext = this.extensions.get(extensionId);
    if (!ext) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    // Validate required config fields
    const missingFields = ext.manifest.configSchema
      .filter((field) => field.required && config[field.key] === undefined)
      .map((field) => field.key);

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required config fields for ${extensionId}: ${missingFields.join(', ')}`
      );
    }

    ext.config = config;
    ext.status = 'configured';

    log.info({ extensionId }, 'Extension configured');
  }

  /**
   * Initialize an extension (create instance)
   */
  async initialize(extensionId: string): Promise<void> {
    const ext = this.extensions.get(extensionId);
    if (!ext) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    if (!ext.config) {
      throw new Error(`Extension not configured: ${extensionId}`);
    }

    ext.status = 'initializing';

    try {
      const manifest = ext.manifest;
      const category = manifest.category;

      switch (category) {
        case 'ai': {
          const aiManifest = manifest as AIExtensionManifest;
          const provider = aiManifest.createProvider(ext.config);
          this.aiProviders.set(extensionId, provider);
          ext.instance = provider;
          break;
        }
        case 'channel': {
          const channelManifest = manifest as ChannelExtensionManifest;
          const adapter = channelManifest.createAdapter(ext.config);
          this.channelAdapters.set(extensionId, adapter);
          ext.instance = adapter;
          break;
        }
        case 'pms': {
          const pmsManifest = manifest as PMSExtensionManifest;
          const adapter = pmsManifest.createAdapter(ext.config);
          this.pmsAdapters.set(extensionId, adapter);
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
      log.info({ extensionId, category }, 'Extension initialized');
    } catch (error) {
      ext.status = 'error';
      ext.lastError = error instanceof Error ? error.message : String(error);
      log.error({ extensionId, error: ext.lastError }, 'Extension initialization failed');
      throw error;
    }
  }

  /**
   * Configure and initialize an extension in one step
   */
  async activate(extensionId: string, config: Record<string, unknown>): Promise<void> {
    this.configure(extensionId, config);
    await this.initialize(extensionId);
  }

  /**
   * Disable an extension
   */
  disable(extensionId: string): void {
    const ext = this.extensions.get(extensionId);
    if (!ext) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    // Remove from provider maps
    this.aiProviders.delete(extensionId);
    this.channelAdapters.delete(extensionId);
    this.pmsAdapters.delete(extensionId);

    ext.instance = undefined;
    ext.status = 'disabled';

    log.info({ extensionId }, 'Extension disabled');
  }

  /**
   * Reconfigure an extension with new settings (hot-reload)
   * This disables the old instance and creates a new one with updated config
   */
  async reconfigure(extensionId: string, config: Record<string, unknown>): Promise<void> {
    const ext = this.extensions.get(extensionId);
    if (!ext) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    log.info({ extensionId }, 'Reconfiguring extension with new settings');

    // Disable old instance if active
    if (ext.status === 'active' || ext.instance) {
      this.disable(extensionId);
    }

    // Re-register to reset state (keep manifest)
    ext.status = 'registered';
    delete ext.config;
    delete ext.lastError;

    // Activate with new config
    await this.activate(extensionId, config);

    log.info({ extensionId }, 'Extension reconfigured successfully');
  }

  /**
   * Run health check on an extension
   */
  async healthCheck(extensionId: string): Promise<ConnectionTestResult> {
    const ext = this.extensions.get(extensionId);
    if (!ext) {
      return {
        success: false,
        message: `Extension not found: ${extensionId}`,
      };
    }

    if (!ext.instance) {
      return {
        success: false,
        message: 'Extension not initialized',
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
          { extensionId, success: result.success },
          'Health check completed'
        );

        return result;
      }

      // No testConnection method - assume healthy
      const result: ConnectionTestResult = {
        success: true,
        message: 'Extension is active (no health check available)',
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

      log.error({ extensionId, error: message }, 'Health check failed');
      return result;
    }
  }

  /**
   * Run health checks on all active extensions
   */
  async healthCheckAll(): Promise<Map<string, ConnectionTestResult>> {
    const results = new Map<string, ConnectionTestResult>();

    for (const [id, ext] of this.extensions) {
      if (ext.status === 'active') {
        results.set(id, await this.healthCheck(id));
      }
    }

    return results;
  }

  /**
   * Get extension by ID
   */
  get(extensionId: string): RegisteredExtension | undefined {
    return this.extensions.get(extensionId);
  }

  /**
   * Get all registered extensions
   */
  getAll(): RegisteredExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get extensions by category
   */
  getByCategory(category: ExtensionCategory): RegisteredExtension[] {
    return this.getAll().filter((ext) => ext.manifest.category === category);
  }

  /**
   * Get active extensions by category
   */
  getActiveByCategory(category: ExtensionCategory): RegisteredExtension[] {
    return this.getByCategory(category).filter((ext) => ext.status === 'active');
  }

  /**
   * Get an AI provider by extension ID
   */
  getAIProvider(extensionId: string): AIProvider | undefined {
    return this.aiProviders.get(extensionId);
  }

  /**
   * Get the first active AI provider
   */
  getActiveAIProvider(): AIProvider | undefined {
    for (const [id, ext] of this.extensions) {
      if (ext.manifest.category === 'ai' && ext.status === 'active') {
        return this.aiProviders.get(id);
      }
    }
    return undefined;
  }

  /**
   * Get a channel adapter by extension ID
   */
  getChannelAdapter(extensionId: string): ChannelAdapter | undefined {
    return this.channelAdapters.get(extensionId);
  }

  /**
   * Get all active channel adapters
   */
  getActiveChannelAdapters(): Map<string, ChannelAdapter> {
    const active = new Map<string, ChannelAdapter>();
    for (const [id, ext] of this.extensions) {
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
   * Get a PMS adapter by extension ID
   */
  getPMSAdapter(extensionId: string): PMSAdapter | undefined {
    return this.pmsAdapters.get(extensionId);
  }

  /**
   * Get the first active PMS adapter
   */
  getActivePMSAdapter(): PMSAdapter | undefined {
    for (const [id, ext] of this.extensions) {
      if (ext.manifest.category === 'pms' && ext.status === 'active') {
        return this.pmsAdapters.get(id);
      }
    }
    return undefined;
  }

  /**
   * Get status summary for all extensions
   */
  getStatusSummary(): Array<{
    id: string;
    name: string;
    category: ExtensionCategory;
    status: ExtensionStatus;
    lastHealthCheck?: Date;
    lastError?: string;
  }> {
    return this.getAll().map((ext) => {
      const summary: {
        id: string;
        name: string;
        category: ExtensionCategory;
        status: ExtensionStatus;
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
   * Clear all extensions (for testing)
   */
  clear(): void {
    this.extensions.clear();
    this.aiProviders.clear();
    this.channelAdapters.clear();
    this.pmsAdapters.clear();
    log.debug('Extension registry cleared');
  }
}

// Singleton instance
let registryInstance: ExtensionRegistry | null = null;

/**
 * Get the global extension registry
 */
export function getExtensionRegistry(): ExtensionRegistry {
  if (!registryInstance) {
    registryInstance = new ExtensionRegistry();
  }
  return registryInstance;
}

/**
 * Reset the extension registry (for testing)
 */
export function resetExtensionRegistry(): void {
  registryInstance?.clear();
  registryInstance = null;
}
