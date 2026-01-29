/**
 * Extension Types
 *
 * Type definitions for the extension system.
 * Extensions are adapters that implement core interfaces.
 *
 * @module extensions/types
 */

import type { AIProvider } from '@/core/interfaces/ai.js';
import type { ChannelAdapter } from '@/core/interfaces/channel.js';
import type { PMSAdapter } from '@/core/interfaces/pms.js';

/**
 * Extension categories
 */
export type ExtensionCategory = 'ai' | 'channel' | 'pms' | 'tool';

/**
 * Extension status
 */
export type ExtensionStatus = 'active' | 'inactive' | 'error' | 'unconfigured';

/**
 * Configuration field types
 */
export type ConfigFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select';

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
  options?: Array<{ value: string; label: string }>; // For 'select' type
  default?: string | number | boolean;
}

/**
 * Base extension manifest
 */
export interface ExtensionManifest {
  /** Unique extension identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Extension category */
  category: ExtensionCategory;
  /** Version string */
  version: string;
  /** Description */
  description: string;
  /** Configuration schema */
  configSchema: ConfigField[];
  /** Icon URL or emoji */
  icon?: string;
  /** Documentation URL */
  docsUrl?: string;
}

/**
 * AI extension manifest
 */
export interface AIExtensionManifest extends ExtensionManifest {
  category: 'ai';
  /** Create an AI provider instance */
  createProvider: (config: Record<string, unknown>) => AIProvider;
  /** Supported capabilities */
  capabilities: {
    completion: boolean;
    embedding: boolean;
    streaming?: boolean;
  };
}

/**
 * Channel extension manifest
 */
export interface ChannelExtensionManifest extends ExtensionManifest {
  category: 'channel';
  /** Create a channel adapter instance */
  createAdapter: (config: Record<string, unknown>) => ChannelAdapter;
  /** Get webhook routes for this channel */
  getWebhookRoutes?: () => unknown; // Hono routes
  /** Channel features */
  features: {
    inbound: boolean;
    outbound: boolean;
    media?: boolean;
    templates?: boolean;
  };
}

/**
 * PMS extension manifest
 */
export interface PMSExtensionManifest extends ExtensionManifest {
  category: 'pms';
  /** Create a PMS adapter instance */
  createAdapter: (config: Record<string, unknown>) => PMSAdapter;
  /** Supported PMS features */
  features: {
    reservations: boolean;
    guests: boolean;
    rooms: boolean;
    webhooks?: boolean;
  };
}

/**
 * Tool extension manifest
 * Tools are built-in utilities for hotel onboarding and operations.
 */
export interface ToolExtensionManifest extends ExtensionManifest {
  category: 'tool';
  /** Dashboard route for the tool UI */
  dashboardRoute: string;
  /** Tool capabilities */
  capabilities: {
    /** Has dedicated UI page */
    hasUI: boolean;
    /** Has API endpoints */
    hasAPI: boolean;
    /** Requires AI processing */
    requiresAI?: boolean;
  };
}

/**
 * Union type for all extension manifests
 */
export type AnyExtensionManifest =
  | AIExtensionManifest
  | ChannelExtensionManifest
  | PMSExtensionManifest
  | ToolExtensionManifest;

/**
 * Extension instance state
 */
export interface ExtensionInstance {
  manifest: AnyExtensionManifest;
  status: ExtensionStatus;
  config: Record<string, unknown>;
  error?: string;
  lastChecked?: Date;
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
 * Base provider interface with connection testing
 */
export interface BaseProvider {
  readonly id: string;
  testConnection(): Promise<ConnectionTestResult>;
}
