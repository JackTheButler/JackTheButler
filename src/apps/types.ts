/**
 * App Types
 *
 * Type definitions for the app system.
 * Apps are adapters that implement core interfaces.
 *
 * @module apps/types
 */

import type { AIProvider } from '@/core/interfaces/ai.js';
import type { ChannelAdapter } from '@/core/interfaces/channel.js';
import type { PMSAdapter } from '@/core/interfaces/pms.js';

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
  options?: Array<{ value: string; label: string }>; // For 'select' type
  default?: string | number | boolean;
}

/**
 * Base app manifest
 */
export interface AppManifest {
  /** Unique app identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** App category */
  category: AppCategory;
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
 * AI app manifest
 */
export interface AIAppManifest extends AppManifest {
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
 * Channel app manifest
 */
export interface ChannelAppManifest extends AppManifest {
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
 * PMS app manifest
 */
export interface PMSAppManifest extends AppManifest {
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
 * Tool app manifest
 * Tools are built-in utilities for hotel onboarding and operations.
 */
export interface ToolAppManifest extends AppManifest {
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
