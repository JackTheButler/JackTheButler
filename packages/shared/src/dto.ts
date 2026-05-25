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

/** A knowledge entry the AI used to compose a reply, snapshotted at generation
 *  time. Field names mirror the knowledge_entries table for consistency; `id`
 *  links back to the live KB entry (for a future "edit in Knowledge" link).
 *  `similarity` is the cosine relevancy 0..1. */
export interface KnowledgeHitDTO {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  similarity: number;
}

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
  /** Knowledge entries this AI reply was grounded in (retrieval transparency).
   *  Present only on `ai` messages that retrieved entries, and only on the
   *  dashboard read path — never populated for the public widget history. */
  knowledgeHits?: KnowledgeHitDTO[];
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
  /** AI escalated this thread to a human and no agent has taken over yet. */
  needsHuman: boolean;
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

/* ── Analytics ─────────────────────────────────────────────────── */

/**
 * Live, point-in-time queue stats for the Analytics page. Role-scoped by the
 * server: admins get the team view (`scope: 'team'`), agents get their own
 * (`scope: 'agent'`). Fields not relevant to a scope are null.
 *
 * Most values are derivable from the live tables with no extra bookkeeping.
 * `activeAgents` is the one presence-backed field: it reads `staff.lastSeenAt`,
 * refreshed by the dashboard socket heartbeat (see core/realtime.ts).
 */
export interface LiveStats {
  scope: 'team' | 'agent';
  /** Open conversations with no assignee (team scope only). */
  unassigned: number | null;
  /** Staff seen via the dashboard socket within the presence window (team
   *  scope only; null in agent scope). A best-effort "who's around now". */
  activeAgents: number | null;
  /** The viewer's own open conversations (agent scope only). */
  myOpen: number | null;
  /** Open conversations whose latest message is from the customer — i.e.
   *  awaiting a reply. Team-wide for admins, the viewer's own for agents. */
  awaitingReply: number;
  /** Minutes the oldest awaiting-reply conversation has been waiting; 0 when
   *  nothing is awaiting a reply. */
  oldestWaitMinutes: number;
}

/**
 * Historical KPI metrics over a date range, derived from the `episodes`
 * projection. Role-scoped like LiveStats; `previous` is the same-length
 * preceding period so the client can show deltas. Raw numbers only — the client
 * formats, labels, and colours.
 */
/** A closed date window, inclusive of both ends. `YYYY-MM-DD`, server-local. */
export interface DateRange {
  from: string;
  to: string;
}

export interface KpiMetrics {
  /** Episodes closed in the period (scoped). */
  episodes: number;
  /** 0–1 share closed with no takeover and no escalation. */
  aiDeflectionRate: number;
  /** 0–1 share that involved a human takeover. */
  handoffRate: number;
  /** 0–1 share that began as a reopen. */
  reopenedRate: number;
  /** Median seconds to first human reply; null if none had one. */
  medianFirstResponseSec: number | null;
  /** Median seconds open→close; null if no episodes. */
  medianResolutionSec: number | null;
}

export interface KpiStats {
  scope: 'team' | 'agent';
  current: KpiMetrics;
  previous: KpiMetrics;
}

/**
 * Time-bucketed trend series for the Analytics charts, derived from `episodes`.
 * Role-scoped like KpiStats. Buckets are daily (7d/30d) or weekly (90d); each
 * point's `date` is the ISO bucket start. Rates/medians are null for empty
 * buckets so the client can render gaps rather than fake zeros.
 */
export interface TrendPoint {
  date: string; // YYYY-MM-DD (bucket start)
  aiResolved: number;
  human: number;
  deflectionRate: number | null; // 0–1
  medianResolutionSec: number | null;
}

export interface TrendStats {
  scope: 'team' | 'agent';
  points: TrendPoint[];
}

/**
 * Aggregate breakdowns for the Analytics page, over a date range and role-scoped
 * like KpiStats. All derived from the closed `episodes` in the period.
 */
export interface AgentWorkload {
  agentId: string;
  name: string;
  resolved: number;
  medianFirstResponseSec: number | null;
}

export interface ChannelVolume {
  channel: string;
  count: number;
}

export interface Breakdowns {
  scope: 'team' | 'agent';
  /** Episodes resolved per agent, busiest first (only agent-closed episodes). */
  workload: AgentWorkload[];
  /** Episode volume by source channel, largest first. */
  channels: ChannelVolume[];
  /** Counts by weekday (row 0 = Monday … 6 = Sunday) × hour (0–23) of when the
   *  episode opened — i.e. when conversations arrive. */
  heatmap: number[][];
}
