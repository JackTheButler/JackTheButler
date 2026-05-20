/**
 * App manifest — JSON-serializable. Sent to the dashboard to render config
 * forms; used by the API to validate. No behavior here (see contracts.ts).
 */

export type AppCategory = 'channel' | 'ai';

/** Capability declared by an `ai` app. The pipeline resolves the active
 *  provider per capability (Stage 6/7). */
export type AppCapability = 'generation' | 'embedding';

export type ConfigFieldType = 'text' | 'password' | 'url' | 'number' | 'select';

export interface ConfigFieldOption {
  value: string;
  label: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  /** Secret values are never returned to clients (masked in GETs). */
  secret?: boolean;
  placeholder?: string;
  /** Required when type === 'select'. */
  options?: ConfigFieldOption[];
}

export interface AppManifest {
  id: string;
  name: string;
  category: AppCategory;
  /** Only meaningful for `ai` apps; the pipeline matches on this. */
  capability?: AppCapability;
  description?: string;
  configFields: ConfigField[];
}
