/** Wire types shared by API + dashboard for the Apps feature. */
import type { AppManifest } from './manifest.js';

/* ── Knowledge base ────────────────────────────────────────────── */

export type KnowledgeStatus = 'draft' | 'approved';

/** One Q&A pair the AI can find via embedding search. `hasEmbedding`
 *  lets the dashboard surface "this entry isn't searchable until an
 *  embedding provider is connected" without sending the raw vector. */
export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  status: KnowledgeStatus;
  hasEmbedding: boolean;
  createdAt: number;
  updatedAt: number;
}


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

/* ── System status ─────────────────────────────────────────────── */

/** Coarse, role-safe health for a provider. Detailed errors/config stay in
 *  the admin-only Apps page; everyone can see this much. */
export type ProviderHealth = 'ok' | 'error' | 'unknown';

export interface ProviderStatus {
  connected: boolean;
  /** Display name of the connected/configured app, or null when none. */
  name: string | null;
  health: ProviderHealth;
}

/** Role-agnostic operational status the dashboard needs to render correctly
 *  without reading the admin-only Apps management endpoint (e.g. so an agent's
 *  KB page knows whether an embedding provider is connected). Slow-changing,
 *  ambient state — fast-changing data keeps its own focused endpoints. */
export interface SystemStatus {
  providers: {
    embedding: ProviderStatus;
    generation: ProviderStatus;
  };
}

/* ── Staff & permissions ───────────────────────────────────────── */

/** admin = full access; agent = Inbox + Knowledge only. */
export type StaffRole = 'admin' | 'agent';
/** invited = created, not yet accepted (no password); active = can log in;
 *  disabled = kept for history, can't log in. */
export type StaffStatus = 'invited' | 'active' | 'disabled';

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  lastLoginAt: number | null;
  createdAt: number;
}

/* ── Assistant profile ─────────────────────────────────────────── */

export type AssistantTone = 'Friendly' | 'Professional' | 'Casual';

/** How verbose replies should be. Orthogonal to tone (voice): tone is *how*
 *  it sounds, length is *how much* it says. Drives a responder-prompt
 *  directive, not a token cap. */
export type ResponseLength = 'brief' | 'standard' | 'detailed';

/** Single-row persona that drives the AI pipeline's system prompt.
 *  Save shape and read shape are identical — secrets aren't involved. */
export interface AssistantProfile {
  name: string;
  tone: AssistantTone;
  responseLength: ResponseLength;
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
  /** BCP-47 code of `content`. Null on pre-translation-era rows + lifecycle
   *  markers. */
  language: string | null;
  /** `content` rendered into the business default language (for inbound) or
   *  the customer's language (for outbound). Null when no translation
   *  applies (same-language turn) or pre-translation-era. */
  translation: string | null;
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
  /** BCP-47 of the customer's language as last detected by the pipeline.
   *  Null on conversations created before language detection landed.
   *  Drives the disclosed-text language label on outbound bubbles. */
  language: string | null;
  messages: MessageDTO[];
}

/* ── Push notifications ────────────────────────────────────────── */

/** Payload sent over Web Push and rendered by the service worker. Kept
 *  channel-agnostic so any feature can raise a notification, not just chat. */
export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Dedupe key — notifications sharing a tag collapse/replace (e.g. one per
   *  conversation), which also coalesces across multiple open tabs. */
  tag?: string;
  /** Dashboard path to focus/open on click (e.g. '/'). */
  url?: string;
  /** Arbitrary structured data for the SW (e.g. { conversationId }). */
  data?: Record<string, unknown>;
}
