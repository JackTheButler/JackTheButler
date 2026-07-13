/**
 * System Service
 *
 * Backs the system status/health/logs dashboard endpoints: knowledge base and
 * memory counts, per-app health cards, and the unified activity/app log stream.
 */

import { count, isNull, isNotNull, eq } from 'drizzle-orm';
import { db, sqlite, knowledgeBase, knowledgeEmbeddings, guestMemories } from '@/db/index.js';
import type { RegisteredApp } from '@/apps/registry.js';

/**
 * Health status derived from recent app_logs / activity_log rows
 */
export type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

/**
 * One health card per active connected app
 */
export interface AppHealthItem {
  appId: string;
  category: string;
  name: string;
  status: HealthStatus;
  summary: string;
  detail: string;
  avgLatencyMs: number | null;
  latencyTrend: 'up' | 'down' | 'stable' | null;
  lastErrorRaw: string | null;
  partialFailure: string | null;
  errorDescription: string | null;
  activityCount: number | null;
}

/**
 * One row of the unified activity_log + app_logs stream
 */
export interface LogEntry {
  id: string;
  source: string;
  eventType: string;
  status: 'success' | 'failed';
  createdAt: string;
  timeAgo: string;
  latencyMs: number | null;
  errorMessage: string | null;
  details: Record<string, unknown> | null;
}

export interface LogFilters {
  source?: string | undefined;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  since?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

// No APP_LOG_IDENTITY map needed — app_logs.app_id = manifest.category,
// app_logs.provider_id = manifest.id. This is enforced by the createAppLogger()
// convention in src/monitoring/instrumentation.ts. New adapters get health cards
// automatically as long as they call createAppLogger(manifest.category, manifest.id).

/**
 * Derive activity_log.source from manifest.id.
 * activity_log sources are the protocol name (whatsapp, sms, email, webchat),
 * while manifest IDs are provider-specific (whatsapp-meta, sms-twilio, etc.).
 * The prefix before the first '-' is the protocol.
 */
function channelSource(manifestId: string): string {
  // channel-webchat → webchat (strip 'channel-' prefix)
  if (manifestId.startsWith('channel-')) return manifestId.slice('channel-'.length);
  // whatsapp-meta → whatsapp, sms-twilio → sms, email-mailgun → email
  return manifestId.split('-')[0] ?? manifestId;
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function deriveStatus(lastRow: { status: string; created_at: string } | undefined): HealthStatus {
  if (!lastRow) return 'unknown';
  if (lastRow.status === 'failed') return 'error';
  const ageMs = Date.now() - new Date(lastRow.created_at).getTime();
  return ageMs > 24 * 60 * 60 * 1000 ? 'warning' : 'healthy';
}

/**
 * Map a raw error message to a plain-language description for staff.
 * Returns null when no pattern matches (raw message is still shown on expand).
 */
export function describeError(errorRaw: string | null, category: string): string | null {
  if (!errorRaw) return null;
  const e = errorRaw.toLowerCase();

  if (e.includes('401') || e.includes('invalid_api_key') || e.includes('invalid api key') || e.includes('api key')) {
    return 'API key rejected — check your credentials in App Settings';
  }
  if (e.includes('403') || e.includes('forbidden')) {
    return 'Access denied — check your credentials or account permissions';
  }
  if (e.includes('429') || e.includes('rate limit') || e.includes('too many requests')) {
    return 'Rate limit exceeded — too many requests; will retry automatically';
  }
  if (e.includes('timed out') || e.includes('etimedout') || e.includes('timeout')) {
    return category === 'pms'
      ? 'PMS connection timed out — check your server address and network'
      : 'Connection timed out — the service may be under load';
  }
  if (e.includes('econnrefused') || e.includes('connection refused')) {
    return 'Connection refused — the service is not running or unreachable';
  }
  if (e.includes('enotfound') || e.includes('getaddrinfo') || e.includes('dns')) {
    return 'DNS lookup failed — check the server address in App Settings';
  }
  if (e.includes('signature') || e.includes('hmac') || e.includes('tamper')) {
    return 'Webhook signature mismatch — check your webhook secret in App Settings';
  }
  if (e.includes('500') || e.includes('server error') || e.includes('internal error')) {
    return 'The remote service returned a server error — usually temporary';
  }
  if (e.includes('ssl') || e.includes('certificate') || e.includes('tls')) {
    return 'SSL/TLS error — the server certificate may be invalid or expired';
  }
  return null;
}

export class SystemService {
  /**
   * Knowledge base entry counts, used by /system/status to flag "empty" or "needs reindex"
   */
  async getKnowledgeBaseCounts(): Promise<{ total: number; withoutEmbeddings: number }> {
    const [totalResult] = await db.select({ count: count() }).from(knowledgeBase);
    const total = totalResult?.count ?? 0;

    let withoutEmbeddings = 0;
    if (total > 0) {
      const rows = await db
        .select({ count: count() })
        .from(knowledgeBase)
        .leftJoin(knowledgeEmbeddings, eq(knowledgeBase.id, knowledgeEmbeddings.id))
        .where(isNull(knowledgeEmbeddings.id));
      withoutEmbeddings = rows[0]?.count ?? 0;
    }

    return { total, withoutEmbeddings };
  }

  /**
   * Guest memory counts, used by /system/status
   */
  async getMemoryCounts(): Promise<{ total: number; withEmbeddings: number }> {
    const [total] = await db.select({ count: count() }).from(guestMemories);
    const [withEmbeddings] = await db.select({ count: count() }).from(guestMemories).where(isNotNull(guestMemories.embedding));

    return { total: total?.count ?? 0, withEmbeddings: withEmbeddings?.count ?? 0 };
  }

  /**
   * Build one health card per active app (ai/channel/pms — tool apps have no outbound
   * calls to report on yet). `activeApps` should already be filtered to status === 'active'.
   */
  getAppHealth(activeApps: RegisteredApp[]): AppHealthItem[] {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const results: AppHealthItem[] = [];

    for (const registryApp of activeApps) {
      const category = registryApp.manifest.category as string;

      // Skip categories that don't make outbound calls (tools have no health signal yet)
      if (!['ai', 'channel', 'pms'].includes(category)) continue;

      const logAppId = category;
      const providerId = registryApp.manifest.id;

      // Most recent event
      const lastRow = sqlite.prepare(
        `SELECT status, created_at, error_message, latency_ms FROM app_logs
         WHERE app_id = ? AND provider_id = ? ORDER BY created_at DESC LIMIT 1`
      ).get(logAppId, providerId) as { status: string; created_at: string; error_message: string | null; latency_ms: number | null } | undefined;

      let status = deriveStatus(lastRow);
      // For channels without outbound API calls (e.g. webchat), app_logs goes stale.
      // If activity_log shows recent messages, override warning → healthy.
      if (status === 'warning' && category === 'channel') {
        const source = channelSource(registryApp.manifest.id);
        const recentActivity = sqlite.prepare(
          `SELECT created_at FROM activity_log WHERE source = ? AND event_type = 'message.sent' ORDER BY created_at DESC LIMIT 1`
        ).get(source) as { created_at: string } | undefined;
        if (recentActivity) {
          const ageMs = Date.now() - new Date(recentActivity.created_at).getTime();
          if (ageMs < 24 * 60 * 60 * 1000) status = 'healthy';
        }
      }

      // Avg latency — last 20 successful rows
      const latencyRow = sqlite.prepare(
        `SELECT AVG(latency_ms) AS avg_ms FROM
         (SELECT latency_ms FROM app_logs WHERE app_id = ? AND provider_id = ? AND status = 'success' AND latency_ms IS NOT NULL
          ORDER BY created_at DESC LIMIT 20)`
      ).get(logAppId, providerId) as { avg_ms: number | null } | undefined;

      // Previous 20 for trend
      const prevLatencyRow = sqlite.prepare(
        `SELECT AVG(latency_ms) AS avg_ms FROM
         (SELECT latency_ms FROM app_logs WHERE app_id = ? AND provider_id = ? AND status = 'success' AND latency_ms IS NOT NULL
          ORDER BY created_at DESC LIMIT 20 OFFSET 20)`
      ).get(logAppId, providerId) as { avg_ms: number | null } | undefined;

      const avgLatencyMs = latencyRow?.avg_ms != null ? Math.round(latencyRow.avg_ms) : null;
      let latencyTrend: 'up' | 'down' | 'stable' | null = null;
      if (avgLatencyMs !== null && prevLatencyRow?.avg_ms != null && prevLatencyRow.avg_ms > 0) {
        const delta = (avgLatencyMs - prevLatencyRow.avg_ms) / prevLatencyRow.avg_ms;
        latencyTrend = delta > 0.1 ? 'up' : delta < -0.1 ? 'down' : 'stable';
      }

      // Most recent error
      const lastErrorRow = sqlite.prepare(
        `SELECT error_message FROM app_logs WHERE app_id = ? AND provider_id = ? AND status = 'failed' AND error_message IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`
      ).get(logAppId, providerId) as { error_message: string } | undefined;

      // Summary + detail per category
      let summary = 'No activity recorded';
      let detail = lastRow?.created_at ? `last activity ${formatRelativeTime(lastRow.created_at)}` : 'no activity yet';
      let activityCount: number | null = null;

      if (category === 'ai') {
        const countRow = sqlite.prepare(
          `SELECT COUNT(*) AS cnt FROM activity_log WHERE event_type = 'processor.outcome' AND status = 'success' AND created_at >= ?`
        ).get(todayISO) as { cnt: number };
        activityCount = countRow.cnt;
        summary = `${countRow.cnt} conversation${countRow.cnt !== 1 ? 's' : ''} processed today`;
      } else if (category === 'channel') {
        const source = channelSource(registryApp.manifest.id);
        const countRow = sqlite.prepare(
          `SELECT COUNT(*) AS cnt FROM activity_log WHERE source = ? AND event_type = 'message.sent' AND created_at >= ?`
        ).get(source, todayISO) as { cnt: number };
        activityCount = countRow.cnt;
        const label = source === 'whatsapp' ? 'WhatsApp messages' : source === 'sms' ? 'SMS messages' : source === 'webchat' ? 'messages' : 'emails';
        summary = `${countRow.cnt} ${label} sent today`;
        // Use activity_log for last activity timestamp — channels like webchat don't write to app_logs on every send
        const lastActivityRow = sqlite.prepare(
          `SELECT created_at FROM activity_log WHERE source = ? AND event_type = 'message.sent' ORDER BY created_at DESC LIMIT 1`
        ).get(source) as { created_at: string } | undefined;
        if (lastActivityRow) {
          detail = `last activity ${formatRelativeTime(lastActivityRow.created_at)}`;
        }
      } else if (category === 'pms') {
        const syncRow = sqlite.prepare(
          `SELECT created_at, details, status FROM activity_log WHERE source = 'system' AND event_type = 'scheduler.outcome' ORDER BY created_at DESC LIMIT 1`
        ).get() as { created_at: string; details: string | null; status: string } | undefined;

        if (syncRow) {
          const d = syncRow.details ? JSON.parse(syncRow.details) as Record<string, unknown> : {};
          summary = `Last sync ${formatRelativeTime(syncRow.created_at)}`;
          detail = d.created !== undefined ? `${d.created as number} created, ${d.updated as number} updated` : '';
        } else {
          summary = 'No sync recorded yet';
          detail = '';
        }
      }

      // Partial failure (PMS: sync errors in last run)
      let partialFailure: string | null = null;
      if (category === 'pms') {
        const partialRow = sqlite.prepare(
          `SELECT details FROM activity_log WHERE source = 'system' AND event_type = 'scheduler.outcome' AND status = 'success' ORDER BY created_at DESC LIMIT 1`
        ).get() as { details: string | null } | undefined;
        if (partialRow?.details) {
          const d = JSON.parse(partialRow.details) as Record<string, unknown>;
          const errors = d.errors as number | undefined;
          if (errors && errors > 0) {
            partialFailure = `${errors} sync error${errors > 1 ? 's' : ''} in last run`;
          }
        }
      }

      results.push({
        appId: registryApp.manifest.id,
        category,
        name: registryApp.manifest.name,
        status,
        summary,
        activityCount,
        detail,
        avgLatencyMs: avgLatencyMs ?? (providerId === 'channel-webchat' ? 0 : null),
        latencyTrend,
        lastErrorRaw: lastErrorRow?.error_message ?? null,
        partialFailure,
        errorDescription: describeError(lastErrorRow?.error_message ?? null, category),
      });
    }

    return results;
  }

  /**
   * Unified log stream from activity_log and app_logs, newest first, with server-side filters.
   */
  getUnifiedLogs(filters: LogFilters = {}): { logs: LogEntry[]; hasMore: boolean; offset: number } {
    const source = filters.source ?? 'all';
    const status = filters.status ?? 'all';
    const from = filters.from ?? '';
    const to = filters.to ?? '';
    const since = filters.since ?? ''; // ISO timestamp — only entries newer than this
    const limit = Math.min(Math.max(1, filters.limit ?? 50), 200);
    const offset = Math.max(0, filters.offset ?? 0);

    // Build WHERE conditions for activity_log (source = source column)
    const actConds: string[] = [];
    const actParams: (string | number)[] = [];
    if (source !== 'all') { actConds.push('source = ?');            actParams.push(source); }
    if (status !== 'all') { actConds.push('status = ?');            actParams.push(status); }
    if (from)             { actConds.push("date(created_at) >= ?"); actParams.push(from); }
    if (to)               { actConds.push("date(created_at) <= ?"); actParams.push(to); }
    if (since)            { actConds.push('created_at > ?');        actParams.push(since); }
    const actWhere = actConds.length ? `WHERE ${actConds.join(' AND ')}` : '';

    // Build WHERE conditions for app_logs (source = provider_id column)
    // Protocol-level filters (whatsapp/sms/email) use LIKE because provider_ids are
    // provider-specific (whatsapp-meta, sms-twilio, email-mailgun, etc.).
    // 'webchat' maps to the single provider_id 'channel-webchat'.
    const appConds: string[] = [];
    const appParams: (string | number)[] = [];
    if (source !== 'all') {
      if (source === 'webchat') {
        appConds.push('provider_id = ?');
        appParams.push('channel-webchat');
      } else if (source === 'whatsapp' || source === 'sms' || source === 'email') {
        appConds.push("provider_id LIKE ?");
        appParams.push(`${source}-%`);
      } else {
        appConds.push('provider_id = ?');
        appParams.push(source);
      }
    }
    if (status !== 'all') { appConds.push('status = ?');            appParams.push(status); }
    if (from)             { appConds.push("date(created_at) >= ?"); appParams.push(from); }
    if (to)               { appConds.push("date(created_at) <= ?"); appParams.push(to); }
    if (since)            { appConds.push('created_at > ?');        appParams.push(since); }
    const appWhere = appConds.length ? `WHERE ${appConds.join(' AND ')}` : '';

    const sql = `
      SELECT id, source,      event_type, status, created_at, error_message, latency_ms, details FROM activity_log ${actWhere}
      UNION ALL
      SELECT id, provider_id, event_type, status, created_at, error_message, latency_ms, details FROM app_logs    ${appWhere}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = sqlite.prepare(sql).all(...actParams, ...appParams, limit + 1, offset) as Array<{
      id: string;
      source: string;
      event_type: string;
      status: string;
      created_at: string;
      error_message: string | null;
      latency_ms: number | null;
      details: string | null;
    }>;

    const hasMore = rows.length > limit;
    const logs = rows.slice(0, limit).map((row) => ({
      id: row.id,
      source: row.source.startsWith('channel-') ? row.source.slice('channel-'.length) : row.source,
      eventType: row.event_type,
      status: row.status as 'success' | 'failed',
      createdAt: row.created_at,
      timeAgo: formatRelativeTime(row.created_at),
      latencyMs: row.latency_ms,
      errorMessage: row.error_message,
      details: row.details ? (JSON.parse(row.details) as Record<string, unknown>) : null,
    }));

    return { logs, hasMore, offset };
  }
}

export const systemService = new SystemService();
