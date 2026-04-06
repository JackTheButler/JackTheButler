/**
 * System Health & Logs API Tests (Phase 4)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '@/gateway/server.js';
import { db } from '@/db/index.js';
import { staff } from '@/db/schema.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { authService } from '@/auth/auth.js';
import { writeActivityLog } from '@/services/activity-log.js';
import { describeError } from '@/gateway/routes/system.js';

// ─── describeError (pure function) ────────────────────────────────────────────

describe('describeError', () => {
  it('returns null for null input', () => {
    expect(describeError(null, 'ai')).toBeNull();
  });

  it('maps 401 to credential error', () => {
    const desc = describeError('401 Unauthorized', 'channel');
    expect(desc).toContain('API key');
  });

  it('maps "invalid_api_key" to credential error', () => {
    const desc = describeError('Error: invalid_api_key provided', 'ai');
    expect(desc).toContain('API key');
  });

  it('maps 429 to rate limit', () => {
    const desc = describeError('429 Too Many Requests', 'ai');
    expect(desc).toContain('Rate limit');
  });

  it('maps timeout to timeout message (generic)', () => {
    const desc = describeError('Connection timed out after 30s', 'channel');
    expect(desc).toContain('timed out');
    expect(desc).not.toContain('PMS');
  });

  it('maps timeout to PMS-specific message when category is pms', () => {
    const desc = describeError('Connection timed out after 30s', 'pms');
    expect(desc).toContain('PMS');
  });

  it('maps ECONNREFUSED to connection refused', () => {
    const desc = describeError('ECONNREFUSED 127.0.0.1:11434', 'ai');
    expect(desc).toContain('Connection refused');
  });

  it('maps ENOTFOUND to DNS error', () => {
    const desc = describeError('getaddrinfo ENOTFOUND api.openai.com', 'ai');
    expect(desc).toContain('DNS');
  });

  it('maps signature failure to webhook secret message', () => {
    const desc = describeError('Signature validation failed — webhook may be tampered', 'channel');
    expect(desc).toContain('signature');
  });

  it('returns null for unrecognized error', () => {
    const desc = describeError('some completely unknown error XYZ', 'ai');
    expect(desc).toBeNull();
  });
});

// ─── /api/v1/system/health & /api/v1/system/logs ─────────────────────────────

describe('System Health & Logs API', () => {
  const testUserId = 'logs-test-admin';
  let adminToken: string;

  beforeAll(async () => {
    await db.delete(staff).where(eq(staff.id, testUserId));

    const passwordHash = await authService.hashPassword('test12345');
    await db.insert(staff).values({
      id: testUserId,
      email: 'logs-test-admin@test.com',
      name: 'Logs Test Admin',
      roleId: SYSTEM_ROLE_IDS.ADMIN,
      status: 'active',
      passwordHash,
    });

    const tokens = await authService.login('logs-test-admin@test.com', 'test12345');
    adminToken = tokens.accessToken;

    // Seed a couple of known activity_log rows for the logs endpoint tests
    writeActivityLog('whatsapp-meta', 'message.sent', 'success', 'conv-logs-test', undefined, 100, { test: true });
    writeActivityLog('system', 'processor.outcome', 'failed', undefined, 'provider error', undefined, undefined);
  });

  afterAll(async () => {
    await db.delete(staff).where(eq(staff.id, testUserId));
  });

  describe('GET /api/v1/system/health', () => {
    it('requires authentication', async () => {
      const res = await app.request('/api/v1/system/health');
      expect(res.status).toBe(401);
    });

    it('returns an apps array', async () => {
      const res = await app.request('/api/v1/system/health', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json() as { apps: unknown[] };
      expect(Array.isArray(data.apps)).toBe(true);
    });

    it('each app item has expected shape', async () => {
      const res = await app.request('/api/v1/system/health', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json() as { apps: Record<string, unknown>[] };

      for (const app of data.apps) {
        expect(typeof app.appId).toBe('string');
        expect(typeof app.category).toBe('string');
        expect(typeof app.name).toBe('string');
        expect(['healthy', 'warning', 'error', 'unknown']).toContain(app.status);
        expect(typeof app.summary).toBe('string');
        expect(typeof app.detail).toBe('string');
      }
    });
  });

  describe('GET /api/v1/system/logs', () => {
    it('requires authentication', async () => {
      const res = await app.request('/api/v1/system/logs');
      expect(res.status).toBe(401);
    });

    it('returns logs and hasMore fields', async () => {
      const res = await app.request('/api/v1/system/logs', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json() as { logs: unknown[]; hasMore: boolean };
      expect(Array.isArray(data.logs)).toBe(true);
      expect(typeof data.hasMore).toBe('boolean');
    });

    it('each log item has expected shape', async () => {
      const res = await app.request('/api/v1/system/logs', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json() as { logs: Record<string, unknown>[] };

      for (const log of data.logs) {
        expect(typeof log.id).toBe('string');
        expect(typeof log.source).toBe('string');
        expect(typeof log.eventType).toBe('string');
        expect(['success', 'failed']).toContain(log.status);
        expect(typeof log.createdAt).toBe('string');
        expect(typeof log.timeAgo).toBe('string');
      }
    });

    it('filters by status=failed', async () => {
      const res = await app.request('/api/v1/system/logs?status=failed', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json() as { logs: { status: string }[] };

      for (const log of data.logs) {
        expect(log.status).toBe('failed');
      }
    });

    it('filters by source', async () => {
      const res = await app.request('/api/v1/system/logs?source=whatsapp-meta', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json() as { logs: { source: string }[] };

      for (const log of data.logs) {
        expect(log.source).toBe('whatsapp-meta');
      }
    });

    it('respects limit param', async () => {
      const res = await app.request('/api/v1/system/logs?limit=2', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json() as { logs: unknown[]; hasMore: boolean };

      expect(data.logs.length).toBeLessThanOrEqual(2);
      // If there are more than 2 rows total, hasMore should be true
      const total = await app.request('/api/v1/system/logs?limit=200', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const totalData = await total.json() as { logs: unknown[] };
      if (totalData.logs.length > 2) {
        expect(data.hasMore).toBe(true);
      }
    });
  });
});
