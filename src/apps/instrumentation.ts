/**
 * App Instrumentation
 *
 * Provides fire-and-forget logging helpers for all outbound adapter calls.
 * Every external API call in src/apps/ must use createAppLogger() — never call
 * SDKs or fetch directly without wrapping. See CLAUDE.md for the rule.
 *
 * Two exports:
 *   writeAppLog()     — low-level insert, used by webhook middleware (Layer 3)
 *   createAppLogger() — factory that binds appId/providerId once per adapter
 *
 * Enrichment helpers:
 *   withLogContext(result, extra) — tag a success result with extra details to store
 *   AppLogError(message, details) — throw with structured details to store on failure
 *
 * @module apps/instrumentation
 */

import { db, appLogs } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('instrumentation');

// Symbol used to attach extra log details to a success result without affecting the value.
const LOG_EXTRA = Symbol('logExtra');

/**
 * Tag a return value with extra details to be merged into app_logs.details on success.
 * The tag is non-enumerable and invisible to JSON.stringify / Object.keys.
 * Silently ignored if result is a primitive or frozen object.
 *
 * Usage inside a wrapped fn:
 *   return withLogContext(apiResponse, { httpStatus: 200, messageId: apiResponse.id });
 */
export function withLogContext<T>(result: T, extra: Record<string, unknown>): T {
  if (result !== null && typeof result === 'object') {
    try {
      Object.defineProperty(result, LOG_EXTRA, { value: extra, enumerable: false, configurable: true });
    } catch {
      // frozen or sealed object — skip enrichment silently
    }
  }
  return result;
}

/**
 * Throw this instead of Error when you want structured details stored in app_logs on failure.
 *
 * Usage inside a wrapped fn:
 *   throw new AppLogError(`API error ${status}`, { httpStatus: status, responseBody: body });
 */
export class AppLogError extends Error {
  readonly logDetails: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'AppLogError';
    this.logDetails = details;
  }
}

/**
 * Write a single row to app_logs.
 * Exported so webhook middleware can call it directly without duplicating the insert.
 * Does NOT call appConfigService.logEvent() — that method is private.
 */
export function writeAppLog(
  appId: string,
  providerId: string,
  eventType: string,
  status: 'success' | 'failed',
  details: Record<string, unknown>,
  errorMessage: string | undefined,
  latencyMs: number
): void {
  db.insert(appLogs)
    .values({
      id: crypto.randomUUID(),
      appId,
      providerId,
      eventType,
      status,
      details: JSON.stringify(details),
      errorMessage: errorMessage ?? null,
      latencyMs,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/**
 * Factory that binds appId and providerId once per adapter instance.
 * Returns a wrapper function used at every outbound call site.
 *
 * Usage in adapter constructor:
 *   private log = createAppLogger('ai', 'anthropic');
 *
 * Usage at each call site:
 *   const result = await this.log('http_request', { model }, () =>
 *     this.client.messages.create({ ... })
 *   );
 *
 * Safety guarantees:
 *   - Fire-and-forget: log writes never block or add latency to the API call
 *   - Always re-throws: the original error is always propagated to the caller
 *   - Silent failures: DB errors from the log write are caught and warned only
 */
export function createAppLogger(appId: string, providerId: string) {
  return function appLog<T>(
    eventType: string,
    details: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const t0 = Date.now();
    return fn().then(
      (result) => {
        try {
          const extra = (result !== null && typeof result === 'object')
            ? ((result as Record<symbol, unknown>)[LOG_EXTRA] as Record<string, unknown> | undefined)
            : undefined;
          const merged = extra ? { ...details, ...extra } : details;
          writeAppLog(appId, providerId, eventType, 'success', merged, undefined, Date.now() - t0);
        } catch (err) {
          log.warn({ err }, 'App log write failed');
        }
        return result;
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        try {
          const extra = err instanceof AppLogError ? err.logDetails : {};
          const merged = Object.keys(extra).length ? { ...details, ...extra } : details;
          writeAppLog(appId, providerId, eventType, 'failed', merged, message, Date.now() - t0);
        } catch (e) {
          log.warn({ e }, 'App log write failed');
        }
        throw err;
      }
    );
  };
}
