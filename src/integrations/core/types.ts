/**
 * Integration Core Types
 *
 * Type definitions for the unified integration layer.
 * All external service connections are managed through this system.
 */

/**
 * Integration categories
 */
export type IntegrationCategory = 'ai' | 'channels' | 'pms' | 'operations';

/**
 * Integration status
 */
export type IntegrationStatus =
  | 'not_configured' // No credentials
  | 'configured' // Has credentials, not tested
  | 'connected' // Tested and working
  | 'error' // Connection failed
  | 'disabled'; // Manually disabled

/**
 * Configuration field types
 */
export type ConfigFieldType = 'text' | 'password' | 'select' | 'boolean' | 'number';

/**
 * Configuration field definition
 */
export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string | boolean | number;
  options?: Array<{ value: string; label: string }>; // For select type
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}

/**
 * Provider definition (available provider types)
 */
export interface ProviderDefinition {
  id: string; // e.g., 'twilio', 'mailgun'
  name: string; // e.g., 'Twilio'
  description: string;
  configSchema: ConfigField[]; // Fields needed for configuration
  docsUrl?: string;
  logoUrl?: string;
}

/**
 * Integration definition (available integration types)
 */
export interface IntegrationDefinition {
  id: string; // e.g., 'sms', 'email', 'pms'
  name: string; // e.g., 'SMS Messaging'
  category: IntegrationCategory;
  description: string;
  icon?: string;
  providers: ProviderDefinition[];
  multiProvider?: boolean; // Can have multiple active providers
  required?: boolean; // Is this integration required for the system to work
}

/**
 * Provider instance (configured provider)
 */
export interface ProviderInstance {
  id: string;
  integrationId: string;
  providerId: string;
  enabled: boolean;
  status: IntegrationStatus;
  config: Record<string, string | boolean | number>; // Stored encrypted
  lastCheckedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Integration instance (configured integration with providers)
 */
export interface IntegrationInstance {
  definition: IntegrationDefinition;
  providers: Array<{
    definition: ProviderDefinition;
    instance?: ProviderInstance;
  }>;
  activeProvider?: ProviderInstance;
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
 * Integration log event types
 */
export type IntegrationLogEventType =
  | 'connection_test'
  | 'sync'
  | 'webhook'
  | 'send'
  | 'receive'
  | 'error'
  | 'config_changed';

/**
 * Integration log entry
 */
export interface IntegrationLogEntry {
  id: string;
  integrationId: string;
  providerId: string;
  eventType: IntegrationLogEventType;
  status: 'success' | 'failed';
  details?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: Date;
}

/**
 * Provider interface that all providers must implement
 */
export interface BaseProvider {
  /**
   * Provider ID (matches ProviderDefinition.id)
   */
  readonly id: string;

  /**
   * Test the connection with current credentials
   */
  testConnection(): Promise<ConnectionTestResult>;
}

/**
 * Factory function type for creating providers
 */
export type ProviderFactory<T extends BaseProvider, C = Record<string, unknown>> = (
  config: C
) => T;
