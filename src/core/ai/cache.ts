/**
 * AI Response Cache
 *
 * Caches AI responses for common FAQ-type queries to reduce
 * API calls and improve response times.
 */

import { createHash, randomUUID } from 'node:crypto';
import { eq, sql, and, lt, gt } from 'drizzle-orm';
import { db, responseCache } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';
import { now } from '@/utils/time.js';

const log = createLogger('ai:cache');

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Time-to-live in seconds (default: 1 hour) */
  ttlSeconds?: number;
  /** Maximum cache entries (default: 1000) */
  maxEntries?: number;
  /** Minimum query length to cache (default: 10) */
  minQueryLength?: number;
}

const DEFAULT_CONFIG: Required<CacheConfig> = {
  ttlSeconds: 3600, // 1 hour
  maxEntries: 1000,
  minQueryLength: 10,
};

/**
 * Cached response data
 */
export interface CachedResponse {
  response: string;
  intent: string | null;
  createdAt: string;
}

/**
 * AI Response Cache Service
 */
export class ResponseCacheService {
  private config: Required<CacheConfig>;

  constructor(config: CacheConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info({ ttl: this.config.ttlSeconds, maxEntries: this.config.maxEntries }, 'Response cache initialized');
  }

  /**
   * Normalize a query for consistent hashing
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Generate a hash for a query
   */
  private hashQuery(query: string): string {
    const normalized = this.normalizeQuery(query);
    return createHash('sha256').update(normalized).digest('hex').substring(0, 32);
  }

  /**
   * Check if a query is cacheable
   */
  private isCacheable(query: string): boolean {
    if (query.length < this.config.minQueryLength) {
      return false;
    }

    // Don't cache queries that seem personal or time-sensitive
    const nonCacheablePatterns = [
      /my\s+(room|reservation|booking)/i,
      /check.?(in|out)/i,
      /bill|payment|charge/i,
      /today|tonight|tomorrow|now/i,
      /can\s+you\s+send/i,
      /please\s+(call|contact)/i,
    ];

    return !nonCacheablePatterns.some((pattern) => pattern.test(query));
  }

  /**
   * Get a cached response
   */
  async get(query: string): Promise<CachedResponse | null> {
    if (!this.isCacheable(query)) {
      return null;
    }

    const hash = this.hashQuery(query);

    try {
      const result = await db
        .select()
        .from(responseCache)
        .where(and(eq(responseCache.queryHash, hash), gt(responseCache.expiresAt, now())))
        .limit(1);

      const entry = result[0];
      if (!entry) {
        return null;
      }

      // Update hit count asynchronously
      db.update(responseCache)
        .set({
          hitCount: sql`${responseCache.hitCount} + 1`,
          lastHitAt: now(),
        })
        .where(eq(responseCache.id, entry.id))
        .run();

      log.debug({ hash, hitCount: entry.hitCount + 1 }, 'Cache hit');

      return {
        response: entry.response,
        intent: entry.intent,
        createdAt: entry.createdAt,
      };
    } catch (error) {
      log.error({ error, hash }, 'Failed to get cached response');
      return null;
    }
  }

  /**
   * Store a response in the cache
   */
  async set(query: string, response: string, intent?: string): Promise<void> {
    if (!this.isCacheable(query)) {
      return;
    }

    const hash = this.hashQuery(query);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttlSeconds * 1000);

    try {
      // Upsert the cache entry
      await db
        .insert(responseCache)
        .values({
          id: randomUUID(),
          queryHash: hash,
          query: query.substring(0, 500), // Truncate for storage
          response,
          intent: intent ?? null,
          hitCount: 0,
          expiresAt: expiresAt.toISOString(),
          createdAt: now.toISOString(),
        })
        .onConflictDoUpdate({
          target: responseCache.queryHash,
          set: {
            response,
            intent: intent ?? null,
            expiresAt: expiresAt.toISOString(),
          },
        });

      log.debug({ hash }, 'Response cached');

      // Prune old entries if needed
      await this.pruneIfNeeded();
    } catch (error) {
      log.error({ error, hash }, 'Failed to cache response');
    }
  }

  /**
   * Prune expired and excess entries
   */
  private async pruneIfNeeded(): Promise<void> {
    try {

      // Delete expired entries
      await db.delete(responseCache).where(lt(responseCache.expiresAt, now()));

      // Count remaining entries
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(responseCache);
      const count = countResult[0]?.count ?? 0;

      // If still over limit, delete least recently used
      if (count > this.config.maxEntries) {
        const excess = count - this.config.maxEntries;
        // Delete oldest entries by lastHitAt (or createdAt if never hit)
        await db.run(sql`
          DELETE FROM response_cache
          WHERE id IN (
            SELECT id FROM response_cache
            ORDER BY COALESCE(last_hit_at, created_at) ASC
            LIMIT ${excess}
          )
        `);

        log.debug({ deleted: excess }, 'Pruned excess cache entries');
      }
    } catch (error) {
      log.error({ error }, 'Failed to prune cache');
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      await db.delete(responseCache);
      log.info('Response cache cleared');
    } catch (error) {
      log.error({ error }, 'Failed to clear cache');
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalHits: number;
    avgHitsPerEntry: number;
  }> {
    try {
      const result = await db
        .select({
          totalEntries: sql<number>`count(*)`,
          totalHits: sql<number>`sum(hit_count)`,
        })
        .from(responseCache);

      const stats = result[0];
      const totalEntries = stats?.totalEntries ?? 0;
      const totalHits = stats?.totalHits ?? 0;

      return {
        totalEntries,
        totalHits,
        avgHitsPerEntry: totalEntries > 0 ? totalHits / totalEntries : 0,
      };
    } catch (error) {
      log.error({ error }, 'Failed to get cache stats');
      return { totalEntries: 0, totalHits: 0, avgHitsPerEntry: 0 };
    }
  }
}

// Singleton instance
let cacheInstance: ResponseCacheService | null = null;

/**
 * Get the response cache service instance
 */
export function getResponseCache(config?: CacheConfig): ResponseCacheService {
  if (!cacheInstance) {
    cacheInstance = new ResponseCacheService(config);
  }
  return cacheInstance;
}
