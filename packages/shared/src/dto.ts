/** Wire types shared by API + dashboard for the Apps feature. */
import type { AppManifest } from './manifest.js';

/* ── Business profile ──────────────────────────────────────────── */

/** Single-row business settings. Drives the dashboard's default reading
 *  language (now) and the AI pipeline's system language (Phase 2).
 *  Only `defaultLanguage` is seeded ('en'); `name` starts empty (the
 *  operator fills it in on first visit) and `supportEmail` is optional. */
export interface BusinessProfile {
  name: string;
  supportEmail: string | null;
  /** BCP-47 code, e.g. 'en', 'fa', 'ar'. */
  defaultLanguage: string;
}

/* ── Assistant profile ─────────────────────────────────────────── */

export type AssistantTone = 'Friendly' | 'Professional' | 'Concise';

/** Single-row persona that drives the AI pipeline's system prompt.
 *  Save shape and read shape are identical — secrets aren't involved. */
export interface AssistantProfile {
  name: string;
  tone: AssistantTone;
  instructions: string;
  fallback: string;
  topicsToAvoid: string;
}


export type AppStatus = 'unconfigured' | 'disabled' | 'active' | 'error';

export interface AppSummary {
  id: string;
  name: string;
  description: string;
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
  /** Most recent integration-call failure (cleared on next success). */
  lastError: string | null;
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
