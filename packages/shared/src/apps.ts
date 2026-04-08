/**
 * Plugin interface types — manifest definitions, PluginContext, and instrumentation helpers.
 *
 * @module shared/apps
 */

import type { AIProvider } from './ai.js';
import type { ChannelAdapter } from './channel.js';
import type { PMSAdapter } from './pms.js';

// ==================
// Core Logger / Context
// ==================

/**
 * Instrumentation logger injected into every plugin via PluginContext.
 * Wraps outbound calls with structured logging to the database.
 */
export type AppLogger = <T>(
  eventType: string,
  details: Record<string, unknown>,
  fn: () => Promise<T>
) => Promise<T>;

/**
 * Context injected into every plugin factory by the registry.
 * Plugins receive this rather than importing createAppLogger directly.
 *
 * @example
 * class MyAdapter {
 *   readonly appLog: AppLogger;
 *   constructor(config: MyConfig, context: PluginContext) {
 *     this.appLog = context.appLog;
 *   }
 * }
 */
export interface PluginContext {
  appLog: AppLogger;
}

// ==================
// Instrumentation Helpers
// ==================

/**
 * Symbol used internally by withLogContext to attach extra details to a result.
 * Exported so createAppLogger (in src/) can read it from the same symbol instance.
 * @internal
 */
export const LOG_EXTRA = Symbol.for('jack.logExtra');

/**
 * Tag a return value with extra details to be merged into app_logs on success.
 * Use this inside an appLog-wrapped function to enrich the recorded log entry.
 *
 * @example
 * return withLogContext(apiResponse, { httpStatus: 200, messageId: apiResponse.id });
 */
export function withLogContext<T>(result: T, extra: Record<string, unknown>): T {
  if (result !== null && typeof result === 'object') {
    try {
      Object.defineProperty(result, LOG_EXTRA, {
        value: extra,
        enumerable: false,
        configurable: true,
      });
    } catch {
      // frozen or sealed object — skip enrichment silently
    }
  }
  return result;
}

/**
 * Throw this instead of Error when you want structured details stored in
 * app_logs on failure (merged into the log entry's details field).
 *
 * @example
 * throw new AppLogError(`API error ${status}`, { httpStatus: status, responseBody: body });
 */
export class AppLogError extends Error {
  readonly logDetails: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'AppLogError';
    this.logDetails = details;
  }
}

// ==================
// App Manifest System
// ==================

/**
 * App categories
 */
export type AppCategory = 'ai' | 'channel' | 'pms' | 'tool';

/**
 * Provider status
 */
export type ProviderStatus = 'active' | 'inactive' | 'error' | 'unconfigured';

/**
 * Configuration field types
 */
export type ConfigFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'color';

/**
 * Configuration field definition
 */
export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  description?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  default?: string | number | boolean;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

/**
 * Base provider interface with connection testing and observability.
 * Every adapter MUST declare `readonly appLog: AppLogger`.
 */
export interface BaseProvider {
  readonly id: string;
  readonly appLog: AppLogger;
  testConnection(): Promise<ConnectionTestResult>;
}

/**
 * Base app manifest
 */
export interface AppManifest {
  id: string;
  name: string;
  category: AppCategory;
  version: string;
  description: string;
  configSchema: ConfigField[];
  icon?: string;
  docsUrl?: string;
}

/**
 * AI app manifest
 */
export interface AIAppManifest extends AppManifest {
  category: 'ai';
  createProvider: (config: Record<string, unknown>, context: PluginContext) => AIProvider;
  capabilities: {
    completion: boolean;
    embedding: boolean;
    streaming?: boolean;
  };
}

/**
 * Channel app manifest
 */
export interface ChannelAppManifest extends AppManifest {
  category: 'channel';
  createAdapter: (config: Record<string, unknown>, context: PluginContext) => ChannelAdapter;
  getWebhookRoutes?: () => unknown;
  features: {
    inbound: boolean;
    outbound: boolean;
    media?: boolean;
    templates?: boolean;
  };
}

/**
 * PMS app manifest
 */
export interface PMSAppManifest extends AppManifest {
  category: 'pms';
  createAdapter: (config: Record<string, unknown>, context: PluginContext) => PMSAdapter;
  features: {
    reservations: boolean;
    guests: boolean;
    rooms: boolean;
    webhooks?: boolean;
  };
}

/**
 * Tool app manifest
 */
export interface ToolAppManifest extends AppManifest {
  category: 'tool';
  dashboardRoute: string;
  capabilities: {
    hasUI: boolean;
    hasAPI: boolean;
    requiresAI?: boolean;
  };
}

/**
 * Union type for all app manifests
 */
export type AnyAppManifest =
  | AIAppManifest
  | ChannelAppManifest
  | PMSAppManifest
  | ToolAppManifest;

/**
 * App instance state
 */
export interface AppInstance {
  manifest: AnyAppManifest;
  status: ProviderStatus;
  config: Record<string, unknown>;
  error?: string;
  lastChecked?: Date;
}

