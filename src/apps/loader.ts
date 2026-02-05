/**
 * App Loader
 *
 * Handles configuration-driven loading of apps from database or environment.
 * Automatically discovers and initializes apps based on saved configuration.
 *
 * @module apps/loader
 */

import { createLogger } from '@/utils/logger.js';
import { getAppRegistry, type AppRegistry } from './registry.js';
import { getAllManifests } from './index.js';
import type { AnyAppManifest, AppCategory } from './types.js';

const log = createLogger('apps:loader');

/**
 * App load configuration from database
 */
export interface LoadConfig {
  appId: string;
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
   * Filter apps by category
   */
  categories?: AppCategory[];
}

/**
 * Load result for an app
 */
export interface LoadResult {
  appId: string;
  success: boolean;
  message: string;
}

/**
 * App Loader class
 *
 * Manages the loading process:
 * - Discovery of available apps
 * - Loading configuration from database
 * - Initializing apps
 * - Running health checks
 */
export class AppLoader {
  private registry: AppRegistry;

  constructor(registry?: AppRegistry) {
    this.registry = registry || getAppRegistry();
  }

  /**
   * Discover and register all available app manifests
   */
  discoverApps(categories?: AppCategory[]): AnyAppManifest[] {
    const manifests = getAllManifests();
    const filtered = categories
      ? manifests.filter((m) => categories.includes(m.category))
      : manifests;

    this.registry.registerAll(filtered);

    log.info(
      { count: filtered.length, categories },
      'Apps discovered and registered'
    );

    return filtered;
  }

  /**
   * Load apps from configuration
   */
  async loadFromConfig(
    configs: LoadConfig[],
    options: LoaderOptions = {}
  ): Promise<LoadResult[]> {
    const results: LoadResult[] = [];

    // Auto-discover if requested
    if (options.autoDiscover) {
      this.discoverApps(options.categories);
    }

    // Sort by priority if specified
    const sortedConfigs = [...configs].sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    );

    // Load each enabled app
    for (const appConfig of sortedConfigs) {
      if (!appConfig.enabled) {
        results.push({
          appId: appConfig.appId,
          success: true,
          message: 'Skipped (disabled)',
        });
        continue;
      }

      try {
        const ext = this.registry.get(appConfig.appId);
        if (!ext) {
          results.push({
            appId: appConfig.appId,
            success: false,
            message: `App not registered: ${appConfig.appId}`,
          });
          continue;
        }

        await this.registry.activate(appConfig.appId, appConfig.config);

        results.push({
          appId: appConfig.appId,
          success: true,
          message: 'Loaded successfully',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          appId: appConfig.appId,
          success: false,
          message,
        });
        log.error(
          { appId: appConfig.appId, error: message },
          'Failed to load app'
        );
      }
    }

    // Run health checks if requested
    if (options.healthCheck) {
      const healthResults = await this.registry.healthCheckAll();
      for (const [id, result] of healthResults) {
        if (!result.success) {
          log.warn(
            { appId: id, error: result.message },
            'App health check failed'
          );
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    log.info(
      { total: results.length, success: successCount },
      'App loading complete'
    );

    return results;
  }

  /**
   * Load apps from environment variables
   *
   * Supports legacy patterns:
   * - ANTHROPIC_API_KEY for AI provider
   * - OPENAI_API_KEY for OpenAI
   * - TWILIO_* for Twilio SMS
   * - WHATSAPP_* for WhatsApp
   */
  loadFromEnvironment(options: LoaderOptions = {}): LoadConfig[] {
    const configs: LoadConfig[] = [];

    // Auto-discover if requested
    if (options.autoDiscover) {
      this.discoverApps(options.categories);
    }

    // Check for legacy environment patterns
    const env = process.env;

    // Anthropic Claude
    if (env.ANTHROPIC_API_KEY) {
      configs.push({
        appId: 'anthropic',
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
        appId: 'openai',
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
        appId: 'ollama',
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
        appId: 'sms-twilio',
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
        appId: 'whatsapp-meta',
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
        appId: 'email-smtp',
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
        appId: 'pms-mock',
        enabled: true,
        config: {},
      });
    }

    log.info(
      { count: configs.length, apps: configs.map((c) => c.appId) },
      'Apps configured from environment'
    );

    return configs;
  }

  /**
   * Auto-load apps from environment
   */
  async autoLoad(options: LoaderOptions = {}): Promise<LoadResult[]> {
    const configs = this.loadFromEnvironment({ autoDiscover: true, ...options });
    return this.loadFromConfig(configs, options);
  }

  /**
   * Get the registry
   */
  getRegistry(): AppRegistry {
    return this.registry;
  }
}

// Singleton loader instance
let loaderInstance: AppLoader | null = null;

/**
 * Get the global app loader
 */
export function getAppLoader(): AppLoader {
  if (!loaderInstance) {
    loaderInstance = new AppLoader();
  }
  return loaderInstance;
}

/**
 * Reset the app loader (for testing)
 */
export function resetAppLoader(): void {
  loaderInstance = null;
}

/**
 * Convenience function to auto-load apps
 */
export async function loadApps(options: LoaderOptions = {}): Promise<LoadResult[]> {
  const loader = getAppLoader();
  return loader.autoLoad(options);
}
