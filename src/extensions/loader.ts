/**
 * Extension Loader
 *
 * Handles configuration-driven loading of extensions from database or environment.
 * Automatically discovers and initializes extensions based on saved configuration.
 *
 * @module extensions/loader
 */

import { createLogger } from '@/utils/logger.js';
import { getExtensionRegistry, type ExtensionRegistry } from './registry.js';
import { getAllManifests } from './index.js';
import type { AnyExtensionManifest, ExtensionCategory } from './types.js';

const log = createLogger('extensions:loader');

/**
 * Extension configuration from database
 */
export interface ExtensionConfig {
  extensionId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  priority?: number;
}

/**
 * Loader options
 */
export interface LoaderOptions {
  /**
   * Auto-discover and register all available manifests
   */
  autoDiscover?: boolean;

  /**
   * Run health checks after loading
   */
  healthCheck?: boolean;

  /**
   * Filter extensions by category
   */
  categories?: ExtensionCategory[];
}

/**
 * Load result for an extension
 */
export interface LoadResult {
  extensionId: string;
  success: boolean;
  message: string;
}

/**
 * Extension Loader class
 *
 * Manages the loading process:
 * - Discovery of available extensions
 * - Loading configuration from database
 * - Initializing extensions
 * - Running health checks
 */
export class ExtensionLoader {
  private registry: ExtensionRegistry;

  constructor(registry?: ExtensionRegistry) {
    this.registry = registry || getExtensionRegistry();
  }

  /**
   * Discover and register all available extension manifests
   */
  discoverExtensions(categories?: ExtensionCategory[]): AnyExtensionManifest[] {
    const manifests = getAllManifests();
    const filtered = categories
      ? manifests.filter((m) => categories.includes(m.category))
      : manifests;

    this.registry.registerAll(filtered);

    log.info(
      { count: filtered.length, categories },
      'Extensions discovered and registered'
    );

    return filtered;
  }

  /**
   * Load extensions from configuration
   */
  async loadFromConfig(
    configs: ExtensionConfig[],
    options: LoaderOptions = {}
  ): Promise<LoadResult[]> {
    const results: LoadResult[] = [];

    // Auto-discover if requested
    if (options.autoDiscover) {
      this.discoverExtensions(options.categories);
    }

    // Sort by priority if specified
    const sortedConfigs = [...configs].sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    );

    // Load each enabled extension
    for (const extConfig of sortedConfigs) {
      if (!extConfig.enabled) {
        results.push({
          extensionId: extConfig.extensionId,
          success: true,
          message: 'Skipped (disabled)',
        });
        continue;
      }

      try {
        const ext = this.registry.get(extConfig.extensionId);
        if (!ext) {
          results.push({
            extensionId: extConfig.extensionId,
            success: false,
            message: `Extension not registered: ${extConfig.extensionId}`,
          });
          continue;
        }

        await this.registry.activate(extConfig.extensionId, extConfig.config);

        results.push({
          extensionId: extConfig.extensionId,
          success: true,
          message: 'Loaded successfully',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          extensionId: extConfig.extensionId,
          success: false,
          message,
        });
        log.error(
          { extensionId: extConfig.extensionId, error: message },
          'Failed to load extension'
        );
      }
    }

    // Run health checks if requested
    if (options.healthCheck) {
      const healthResults = await this.registry.healthCheckAll();
      for (const [id, result] of healthResults) {
        if (!result.success) {
          log.warn(
            { extensionId: id, error: result.message },
            'Extension health check failed'
          );
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    log.info(
      { total: results.length, success: successCount },
      'Extension loading complete'
    );

    return results;
  }

  /**
   * Load extensions from environment variables
   *
   * Looks for environment variables matching the pattern:
   * - EXTENSION_{ID}_ENABLED=true
   * - EXTENSION_{ID}_{KEY}=value
   *
   * Also supports legacy patterns:
   * - ANTHROPIC_API_KEY for AI provider
   * - OPENAI_API_KEY for OpenAI
   * - TWILIO_* for Twilio SMS
   * - WHATSAPP_* for WhatsApp
   */
  loadFromEnvironment(options: LoaderOptions = {}): ExtensionConfig[] {
    const configs: ExtensionConfig[] = [];

    // Auto-discover if requested
    if (options.autoDiscover) {
      this.discoverExtensions(options.categories);
    }

    // Check for legacy environment patterns
    const env = process.env;

    // Anthropic Claude
    if (env.ANTHROPIC_API_KEY) {
      configs.push({
        extensionId: 'anthropic',
        enabled: true,
        config: {
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          maxTokens: parseInt(env.ANTHROPIC_MAX_TOKENS || '1024', 10),
        },
        priority: 1,
      });
    }

    // OpenAI
    if (env.OPENAI_API_KEY) {
      configs.push({
        extensionId: 'openai',
        enabled: true,
        config: {
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL || 'gpt-4o',
          maxTokens: parseInt(env.OPENAI_MAX_TOKENS || '1024', 10),
        },
        priority: env.ANTHROPIC_API_KEY ? 2 : 1, // Fallback if Anthropic is also configured
      });
    }

    // Ollama (local)
    if (env.OLLAMA_BASE_URL) {
      configs.push({
        extensionId: 'ollama',
        enabled: true,
        config: {
          baseUrl: env.OLLAMA_BASE_URL,
          model: env.OLLAMA_MODEL || 'llama3',
        },
        priority: 10, // Lower priority for local fallback
      });
    }

    // Twilio SMS
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      configs.push({
        extensionId: 'sms-twilio',
        enabled: true,
        config: {
          accountSid: env.TWILIO_ACCOUNT_SID,
          authToken: env.TWILIO_AUTH_TOKEN,
          phoneNumber: env.TWILIO_PHONE_NUMBER || '',
        },
      });
    }

    // WhatsApp (Meta)
    if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
      configs.push({
        extensionId: 'whatsapp-meta',
        enabled: true,
        config: {
          accessToken: env.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          verifyToken: env.WHATSAPP_VERIFY_TOKEN,
          appSecret: env.WHATSAPP_APP_SECRET,
        },
      });
    }

    // SMTP Email
    if (env.SMTP_HOST && env.SMTP_FROM_ADDRESS) {
      configs.push({
        extensionId: 'email-smtp',
        enabled: true,
        config: {
          smtpHost: env.SMTP_HOST,
          smtpPort: parseInt(env.SMTP_PORT || '587', 10),
          smtpUser: env.SMTP_USER,
          smtpPass: env.SMTP_PASS,
          smtpSecure: env.SMTP_SECURE === 'true',
          fromAddress: env.SMTP_FROM_ADDRESS,
          fromName: env.SMTP_FROM_NAME,
        },
      });
    }

    // Mock PMS (development)
    if (env.NODE_ENV === 'development' || env.USE_MOCK_PMS === 'true') {
      configs.push({
        extensionId: 'pms-mock',
        enabled: true,
        config: {},
      });
    }

    log.info(
      { count: configs.length, extensions: configs.map((c) => c.extensionId) },
      'Extensions configured from environment'
    );

    return configs;
  }

  /**
   * Auto-load extensions from environment
   */
  async autoLoad(options: LoaderOptions = {}): Promise<LoadResult[]> {
    const configs = this.loadFromEnvironment({ autoDiscover: true, ...options });
    return this.loadFromConfig(configs, options);
  }

  /**
   * Get the registry
   */
  getRegistry(): ExtensionRegistry {
    return this.registry;
  }
}

// Singleton loader instance
let loaderInstance: ExtensionLoader | null = null;

/**
 * Get the global extension loader
 */
export function getExtensionLoader(): ExtensionLoader {
  if (!loaderInstance) {
    loaderInstance = new ExtensionLoader();
  }
  return loaderInstance;
}

/**
 * Reset the extension loader (for testing)
 */
export function resetExtensionLoader(): void {
  loaderInstance = null;
}

/**
 * Convenience function to auto-load extensions
 */
export async function loadExtensions(options: LoaderOptions = {}): Promise<LoadResult[]> {
  const loader = getExtensionLoader();
  return loader.autoLoad(options);
}
