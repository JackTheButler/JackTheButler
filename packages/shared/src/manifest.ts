/**
 * App manifest — JSON-serializable. Sent to the dashboard to render config
 * forms; used by the API to validate. No behavior here (see contracts.ts).
 */

/**
 * Top-level app category. Mirrors how operators think about each app's
 * job, so it doubles as a filter pill in /apps:
 *  - `channel`   — where customers reach the business (WebChat, future
 *                  WhatsApp, Telegram, …).
 *  - `ai`        — the model that generates replies (Anthropic today;
 *                  future OpenAI chat, Bedrock, …).
 *  - `embedding` — vector search over the knowledge base (OpenAI
 *                  Embeddings today; future Voyage, Cohere, …).
 */
export type AppCategory = 'channel' | 'ai' | 'embedding';

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
  description?: string;
  configFields: ConfigField[];
}
