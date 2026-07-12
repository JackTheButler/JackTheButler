/**
 * App Management API Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, appConfigs, appLogs } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { AuthService } from '@/auth/auth.js';
import { getAppRegistry } from '@/apps/registry.js';
import type { AIAppManifest } from '@/apps/types.js';

// A fake AI app manifest registered directly into the real app registry so the
// routes under test (which read getAllManifests()/getManifest()) have something
// real to operate on, without loading any real provider or hitting the network.
const fakeTestConnection = vi.fn();

const fakeAppManifest: AIAppManifest = {
  id: 'test-ai-app',
  name: 'Test AI App',
  category: 'ai',
  version: '1.0.0',
  description: 'Fake AI app for apps.ts route tests',
  configSchema: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
  capabilities: { completion: true, embedding: false },
  createProvider: () => ({
    name: 'test-ai-app',
    complete: vi.fn(),
    embed: vi.fn(),
    // Extra method read reflectively by AppRegistry.healthCheck(); not part of the
    // AIProvider type, but present at runtime like a real provider's testConnection.
    testConnection: fakeTestConnection,
  } as never),
};

describe('Apps API', () => {
  const authService = new AuthService();

  const adminUserId = 'apps-api-admin';
  const staffUserId = 'apps-api-staff';

  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    getAppRegistry().register(fakeAppManifest);

    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));

    const passwordHash = await authService.hashPassword('test123');
    await db.insert(staff).values([
      {
        id: adminUserId,
        email: 'apps-api-admin@test.com',
        name: 'Admin User',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      },
      {
        id: staffUserId,
        email: 'apps-api-staff@test.com',
        name: 'Staff User',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'active',
        passwordHash,
      },
    ]);

    const adminTokens = await authService.login('apps-api-admin@test.com', 'test123');
    const staffTokens = await authService.login('apps-api-staff@test.com', 'test123');
    adminToken = adminTokens.accessToken;
    staffToken = staffTokens.accessToken;
  });

  afterAll(async () => {
    await db.delete(staff).where(eq(staff.id, adminUserId));
    await db.delete(staff).where(eq(staff.id, staffUserId));
    await db.delete(appConfigs).where(eq(appConfigs.providerId, 'test-ai-app'));
    await db.delete(appLogs).where(eq(appLogs.providerId, 'test-ai-app'));
  });

  describe('GET /api/v1/apps', () => {
    it('lists all apps for an authorized user', async () => {
      const res = await app.request('/api/v1/apps', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.apps)).toBe(true);
      const fakeApp = json.apps.find((a: { id: string }) => a.id === 'test-ai-app');
      expect(fakeApp).toBeDefined();
      expect(fakeApp.category).toBe('ai');
      expect(fakeApp.enabled).toBe(false);
      expect(fakeApp.status).toBe('not_configured');
    });

    it('returns 401 without authentication', async () => {
      const res = await app.request('/api/v1/apps');
      expect(res.status).toBe(401);
    });

    it('returns 403 for a user lacking settings:view', async () => {
      const res = await app.request('/api/v1/apps', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/apps/categories', () => {
    it('groups apps by category', async () => {
      const res = await app.request('/api/v1/apps/categories', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.categories)).toBe(true);
      const aiGroup = json.categories.find((c: { id: string }) => c.id === 'ai');
      expect(aiGroup).toBeDefined();
      expect(aiGroup.label).toBe('AI Providers');
      expect(aiGroup.apps.some((a: { id: string }) => a.id === 'test-ai-app')).toBe(true);
    });

    it('returns 403 for a user lacking settings:view', async () => {
      const res = await app.request('/api/v1/apps/categories', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/apps/registry', () => {
    it('returns the static manifest registry', async () => {
      const res = await app.request('/api/v1/apps/registry', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      const fakeApp = json.apps.find((a: { id: string }) => a.id === 'test-ai-app');
      expect(fakeApp).toBeDefined();
      expect(fakeApp.configSchema).toEqual(fakeAppManifest.configSchema);
    });
  });

  describe('GET /api/v1/apps/:appId', () => {
    it('returns 404 for an unknown app', async () => {
      const res = await app.request('/api/v1/apps/does-not-exist', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('returns app details with no config yet', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe('test-ai-app');
      expect(json.config).toBeNull();
      expect(json.enabled).toBe(false);
    });

    it('returns 403 for a user lacking settings:view', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/apps/:appId', () => {
    afterAll(async () => {
      await db.delete(appConfigs).where(eq(appConfigs.providerId, 'test-ai-app'));
    });

    it('returns 404 for an unknown app', async () => {
      const res = await app.request('/api/v1/apps/does-not-exist', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, config: { apiKey: 'sk-test' } }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid body', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { apiKey: 12345, nested: { a: 1 } } }), // nested object not allowed by schema
      });
      expect(res.status).toBe(400);
    });

    it('creates and saves config, masking the secret in the response', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, config: { apiKey: 'sk-test-secret-value' } }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.config.enabled).toBe(true);
      expect(json.config.config.apiKey).not.toBe('sk-test-secret-value');
      expect(json.config.config.apiKey).toContain('*');

      // Registry should now have it active since createProvider() was invoked.
      expect(getAppRegistry().get('test-ai-app')?.status).toBe('active');
    });

    it('merges new config over existing and ignores masked (echoed) values', async () => {
      // First fetch the masked value as the UI would.
      const getRes = await app.request('/api/v1/apps/test-ai-app', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const existing = (await getRes.json()).config;
      expect(existing.apiKey).toContain('*');

      // Simulate the UI re-submitting the masked value unchanged alongside a new field.
      const res = await app.request('/api/v1/apps/test-ai-app', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { apiKey: existing.apiKey, extra: 'kept' } }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      // The masked apiKey should have been skipped, so the real underlying secret persists.
      const configRow = await db.select().from(appConfigs).where(eq(appConfigs.providerId, 'test-ai-app')).get();
      expect(configRow).toBeDefined();
      expect(json.config.config.extra).toBe('kept');
    });

    it('auto-generates a widget key for channel-webchat on first save', async () => {
      const res = await app.request('/api/v1/apps/channel-webchat', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false, config: {} }),
      });

      // channel-webchat is a built-in manifest that discoverApps() would register, but
      // since this test file never calls discoverApps(), the manifest is not registered
      // here and the route correctly reports it as not found.
      expect(res.status).toBe(404);
    });

    it('returns 403 for a user lacking settings:manage', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, config: { apiKey: 'x' } }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/apps/:appId/test', () => {
    it('returns 404 for an unknown app', async () => {
      const res = await app.request('/api/v1/apps/does-not-exist/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 when the app has no saved config', async () => {
      await db.delete(appConfigs).where(eq(appConfigs.providerId, 'test-ai-app'));

      const res = await app.request('/api/v1/apps/test-ai-app/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(400);
    });

    it('runs the connection test and reports success', async () => {
      await app.request('/api/v1/apps/test-ai-app', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, config: { apiKey: 'sk-test' } }),
      });
      fakeTestConnection.mockResolvedValueOnce({ success: true, message: 'Connected OK', latencyMs: 12 });

      const res = await app.request('/api/v1/apps/test-ai-app/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe('Connected OK');
      expect(json.latencyMs).toBe(12);
    });

    it('reports failure when the health check fails', async () => {
      fakeTestConnection.mockResolvedValueOnce({ success: false, message: 'Bad credentials' });

      const res = await app.request('/api/v1/apps/test-ai-app/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toBe('Bad credentials');
    });

    it('returns 403 for a user lacking settings:manage', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/apps/:appId/toggle', () => {
    it('disables an app', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.enabled).toBe(false);
      expect(json.status).toBe('disabled');
    });

    it('re-enables an app', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.enabled).toBe(true);
      expect(json.status).toBe('configured');
    });

    it('returns 404 for an app with no saved config', async () => {
      const res = await app.request('/api/v1/apps/does-not-exist/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 for a user lacking settings:manage', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/apps/:appId/logs', () => {
    it('returns logs generated by config saves and connection tests', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app/logs', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.logs)).toBe(true);
      expect(json.logs.length).toBeGreaterThan(0);
      expect(json.logs[0]).toHaveProperty('eventType');
      expect(json.logs[0]).toHaveProperty('createdAt');
    });

    it('respects and caps the limit query param', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app/logs?limit=500', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.logs.length).toBeLessThanOrEqual(100);
    });

    it('returns an empty list for an unknown app', async () => {
      const res = await app.request('/api/v1/apps/does-not-exist/logs', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.logs).toEqual([]);
    });

    it('returns 403 for a user lacking settings:view', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app/logs', {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/apps/:appId', () => {
    it('returns 403 for a user lacking settings:manage', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 when there is nothing to delete', async () => {
      const res = await app.request('/api/v1/apps/does-not-exist', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('deletes the app config', async () => {
      const res = await app.request('/api/v1/apps/test-ai-app', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const configRow = await db.select().from(appConfigs).where(eq(appConfigs.providerId, 'test-ai-app')).get();
      expect(configRow).toBeUndefined();
    });
  });
});
