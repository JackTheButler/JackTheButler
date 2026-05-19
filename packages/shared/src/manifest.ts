/**
 * App manifest — JSON-serializable. Sent to the dashboard to render config
 * forms; used by the API to validate. No behavior here (see contracts.ts).
 */

export type AppCategory = 'channel' | 'ai';

export type ConfigFieldType = 'text' | 'password' | 'url' | 'number';

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  /** Secret values are never returned to clients (masked in GETs). */
  secret?: boolean;
  placeholder?: string;
}

export interface AppManifest {
  id: string;
  name: string;
  category: AppCategory;
  description?: string;
  configFields: ConfigField[];
}
