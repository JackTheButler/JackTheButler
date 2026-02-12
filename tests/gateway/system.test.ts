/**
 * System Status API Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { resetAppRegistry, getAppRegistry } from '@/apps/registry.js';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { AuthService, authService } from '@/services/auth.js';
import type { AIAppManifest } from '@/apps/types.js';

describe('System Status API', () => {
  const testUserId = 'system-test-admin';
  let adminToken: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await db.delete(staff).where(eq(staff.id, testUserId));

    // Create test user with admin role
    const passwordHash = await authService.hashPassword('test12345');
    await db.insert(staff).values({
      id: testUserId,
      email: 'system-test-admin@test.com',
      name: 'System Test Admin',
      roleId: SYSTEM_ROLE_IDS.ADMIN,
      status: 'active',
      passwordHash,
    });

    // Get token
    const tokens = await authService.login('system-test-admin@test.com', 'test12345');
    adminToken = tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up
    await db.delete(staff).where(eq(staff.id, testUserId));
  });

  beforeEach(() => {
    resetAppRegistry();
  });

  afterEach(() => {
    resetAppRegistry();
  });

  describe('GET /api/v1/system/status', () => {
    it('should return unhealthy status when no providers configured', async () => {
      const res = await app.request('/api/v1/system/status', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.healthy).toBe(false);
      expect(data.issues.length).toBeGreaterThan(0);
      expect(data.issues.some((i: { type: string }) => i.type === 'no_completion_provider')).toBe(true);
      expect(data.issues.some((i: { type: string }) => i.type === 'no_embedding_provider')).toBe(true);
      expect(data.providers.completion).toBeNull();
      expect(data.providers.embedding).toBeNull();
    });

    it('should return healthy status with cloud AI configured', async () => {
      // Register and activate a mock AI provider with both capabilities
      const registry = getAppRegistry();
      const mockManifest: AIAppManifest = {
        id: 'openai',
        name: 'OpenAI',
        category: 'ai',
        version: '1.0.0',
        description: 'Test',
        configSchema: [],
        capabilities: { completion: true, embedding: true },
        createProvider: () => ({
          name: 'openai',
          complete: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } }),
          embed: async () => ({ embedding: [], usage: { inputTokens: 0, outputTokens: 0 } }),
        }),
      };

      registry.register(mockManifest);
      await registry.activate('openai', {});

      const res = await app.request('/api/v1/system/status', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.healthy).toBe(true);
      expect(data.providers.completion).toBe('openai');
      expect(data.providers.embedding).toBe('openai');
      expect(data.providers.completionIsLocal).toBe(false);
      expect(data.providers.embeddingIsLocal).toBe(false);
    });

    it('should show info when using local embeddings as fallback', async () => {
      const registry = getAppRegistry();

      // Register Anthropic (no embedding)
      const anthropicManifest: AIAppManifest = {
        id: 'anthropic',
        name: 'Anthropic',
        category: 'ai',
        version: '1.0.0',
        description: 'Test',
        configSchema: [],
        capabilities: { completion: true, embedding: false },
        createProvider: () => ({
          name: 'anthropic',
          complete: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } }),
          embed: async () => ({ embedding: [], usage: { inputTokens: 0, outputTokens: 0 } }),
        }),
      };

      // Register local (with embedding)
      const localManifest: AIAppManifest = {
        id: 'local',
        name: 'Local AI',
        category: 'ai',
        version: '1.0.0',
        description: 'Test',
        configSchema: [],
        capabilities: { completion: true, embedding: true },
        createProvider: () => ({
          name: 'local',
          complete: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } }),
          embed: async () => ({ embedding: [], usage: { inputTokens: 0, outputTokens: 0 } }),
        }),
      };

      registry.register(anthropicManifest);
      registry.register(localManifest);
      await registry.activate('anthropic', {});
      await registry.activate('local', {});

      const res = await app.request('/api/v1/system/status', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      expect(data.healthy).toBe(true);
      expect(data.providers.completion).toBe('anthropic');
      expect(data.providers.embedding).toBe('local');
      expect(data.providers.embeddingIsLocal).toBe(true);
    });

    it('should warn when using local completion', async () => {
      const registry = getAppRegistry();

      const localManifest: AIAppManifest = {
        id: 'local',
        name: 'Local AI',
        category: 'ai',
        version: '1.0.0',
        description: 'Test',
        configSchema: [],
        capabilities: { completion: true, embedding: true },
        createProvider: () => ({
          name: 'local',
          complete: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } }),
          embed: async () => ({ embedding: [], usage: { inputTokens: 0, outputTokens: 0 } }),
        }),
      };

      registry.register(localManifest);
      await registry.activate('local', {});

      const res = await app.request('/api/v1/system/status', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      expect(data.providers.completion).toBe('local');
      expect(data.providers.completionIsLocal).toBe(true);
      expect(data.issues.some((i: { type: string }) => i.type === 'using_local_completion')).toBe(true);
    });

    it('should include app counts', async () => {
      const res = await app.request('/api/v1/system/status', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      expect(data.apps).toBeDefined();
      expect(typeof data.apps.ai).toBe('number');
      expect(typeof data.apps.channel).toBe('number');
      expect(typeof data.apps.pms).toBe('number');
      expect(typeof data.apps.tool).toBe('number');
    });
  });

  describe('GET /api/v1/system/capabilities', () => {
    it('should return capabilities based on configured providers', async () => {
      const res = await app.request('/api/v1/system/capabilities', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.capabilities).toBeDefined();
      expect(typeof data.capabilities.completion).toBe('boolean');
      expect(typeof data.capabilities.embedding).toBe('boolean');
      expect(typeof data.capabilities.streaming).toBe('boolean');
    });

    it('should show streaming capability when provider supports it', async () => {
      const registry = getAppRegistry();

      const streamingManifest: AIAppManifest = {
        id: 'streaming-ai',
        name: 'Streaming AI',
        category: 'ai',
        version: '1.0.0',
        description: 'Test',
        configSchema: [],
        capabilities: { completion: true, embedding: true, streaming: true },
        createProvider: () => ({
          name: 'streaming-ai',
          complete: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } }),
          embed: async () => ({ embedding: [], usage: { inputTokens: 0, outputTokens: 0 } }),
        }),
      };

      registry.register(streamingManifest);
      await registry.activate('streaming-ai', {});

      const res = await app.request('/api/v1/system/capabilities', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      expect(data.capabilities.streaming).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should require authentication for /status', async () => {
      const res = await app.request('/api/v1/system/status');
      expect(res.status).toBe(401);
    });

    it('should require authentication for /capabilities', async () => {
      const res = await app.request('/api/v1/system/capabilities');
      expect(res.status).toBe(401);
    });
  });
});
