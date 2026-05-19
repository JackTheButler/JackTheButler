/** Wire types shared by API + dashboard for the Apps feature. */
import type { AppManifest } from './manifest.js';

export type AppStatus = 'unconfigured' | 'disabled' | 'active' | 'error';

export interface AppSummary {
  id: string;
  name: string;
  category: AppManifest['category'];
  enabled: boolean;
  status: AppStatus;
}

export interface AppDetail {
  manifest: AppManifest;
  enabled: boolean;
  status: AppStatus;
  /** Current config; secret fields are masked, never the stored value. */
  config: Record<string, unknown>;
}

/* ── Conversations ─────────────────────────────────────────────── */

export type ConversationMode = 'ai' | 'human';
export type ConversationStatus = 'open' | 'closed';
export type MessageAuthor = 'customer' | 'agent' | 'ai' | 'system';

export interface MessageDTO {
  id: string;
  author: MessageAuthor;
  content: string;
  /** Set on lifecycle markers (e.g. 'reopened'); null for real messages. */
  event: string | null;
  createdAt: number;
}

export interface ConversationSummary {
  id: string;
  ref: number;
  channel: string;
  mode: ConversationMode;
  status: ConversationStatus;
  customerName: string | null;
  snippet: string;
  needsReply: boolean;
  lastMessageAt: number;
}

export interface ConversationCustomer {
  id: string;
  name: string | null;
  contact: string | null;
}

export interface ConversationDetail {
  id: string;
  ref: number;
  channel: string;
  mode: ConversationMode;
  status: ConversationStatus;
  customer: ConversationCustomer | null;
  messages: MessageDTO[];
}
