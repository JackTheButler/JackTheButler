/**
 * Integration Management API Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { db, integrationConfigs } from '@/db/index.js';
import { eq, and } from 'drizzle-orm';
import { integrationRoutes } from '@/gateway/routes/integrations.js';
import { generateId } from '@/utils/id.js';
import { encryptObject } from '@/utils/crypto.js';

// Create test app
const app = new Hono();
app.route('/api/v1/integrations', integrationRoutes);

describe('Integration Management API', () => {
  // Helper to clean up test data
  const cleanupTestData = async () => {
    await db.delete(integrationConfigs).where(eq(integrationConfigs.integrationId, 'ai')).run();
    await db.delete(integrationConfigs).where(eq(integrationConfigs.integrationId, 'sms')).run();
  };

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('GET /api/v1/integrations', () => {
    it('should list all available integrations', async () => {
      const res = await app.request('/api/v1/integrations');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.integrations).toBeDefined();
      expect(Array.isArray(body.integrations)).toBe(true);

      // Should have AI, WhatsApp, SMS, Email, Webchat, PMS integrations
      const integrationIds = body.integrations.map((i: { id: string }) => i.id);
      expect(integrationIds).toContain('ai');
      expect(integrationIds).toContain('whatsapp');
      expect(integrationIds).toContain('sms');
      expect(integrationIds).toContain('email');
      expect(integrationIds).toContain('webchat');
      expect(integrationIds).toContain('pms');
    });

    it('should show integration structure correctly', async () => {
      const res = await app.request('/api/v1/integrations');
      const body = await res.json();

      const aiIntegration = body.integrations.find((i: { id: string }) => i.id === 'ai');
      expect(aiIntegration).toBeDefined();
      expect(aiIntegration.name).toBe('AI Provider');
      expect(aiIntegration.category).toBe('ai');
      expect(aiIntegration.required).toBe(true);
      expect(aiIntegration.providers).toBeDefined();
      expect(Array.isArray(aiIntegration.providers)).toBe(true);

      // AI should have multiple providers
      const providerIds = aiIntegration.providers.map((p: { id: string }) => p.id);
      expect(providerIds).toContain('anthropic');
      expect(providerIds).toContain('openai');
      expect(providerIds).toContain('ollama');
    });
  });

  describe('GET /api/v1/integrations/:integrationId', () => {
    it('should get integration details', async () => {
      const res = await app.request('/api/v1/integrations/ai');

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.id).toBe('ai');
      expect(body.name).toBe('AI Provider');
      expect(body.providers).toBeDefined();

      // Should include config schema for each provider
      const anthropicProvider = body.providers.find((p: { id: string }) => p.id === 'anthropic');
      expect(anthropicProvider).toBeDefined();
      expect(anthropicProvider.configSchema).toBeDefined();
      expect(Array.isArray(anthropicProvider.configSchema)).toBe(true);
    });

    it('should return 404 for unknown integration', async () => {
      const res = await app.request('/api/v1/integrations/unknown');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Integration not found');
    });
  });

  describe('GET /api/v1/integrations/:integrationId/providers/:providerId', () => {
    it('should get provider config with masked credentials', async () => {
      // Insert test config
      const id = generateId('integration');
      const testConfig = encryptObject({ apiKey: 'sk-test-key-12345' });
      await db
        .insert(integrationConfigs)
        .values({
          id,
          integrationId: 'ai',
          providerId: 'anthropic',
          enabled: true,
          status: 'configured',
          config: testConfig,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const res = await app.request('/api/v1/integrations/ai/providers/anthropic');

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.integrationId).toBe('ai');
      expect(body.providerId).toBe('anthropic');
      expect(body.config).toBeDefined();
      expect(body.config.enabled).toBe(true);
      // API key should be masked
      expect(body.config.config.apiKey).toContain('****');
    });

    it('should return null config for unconfigured provider', async () => {
      const res = await app.request('/api/v1/integrations/ai/providers/openai');

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.integrationId).toBe('ai');
      expect(body.providerId).toBe('openai');
      expect(body.config).toBeNull();
    });

    it('should return 404 for unknown provider', async () => {
      const res = await app.request('/api/v1/integrations/ai/providers/unknown');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/integrations/:integrationId/providers/:providerId', () => {
    it('should create new provider config', async () => {
      const res = await app.request('/api/v1/integrations/ai/providers/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          config: { apiKey: 'sk-ant-test-key' },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.config.enabled).toBe(true);
      expect(body.config.status).toBe('configured');
      // Config should be masked in response
      expect(body.config.config.apiKey).toContain('****');
    });

    it('should update existing provider config', async () => {
      // Create initial config
      await app.request('/api/v1/integrations/ai/providers/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          config: { apiKey: 'sk-ant-old-key' },
        }),
      });

      // Update config
      const res = await app.request('/api/v1/integrations/ai/providers/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { apiKey: 'sk-ant-new-key', model: 'claude-3-sonnet' },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      // Should merge new model with updated key
      expect(body.config.config).toHaveProperty('model');
    });

    it('should return 400 for invalid body', async () => {
      const res = await app.request('/api/v1/integrations/ai/providers/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: 'not-a-boolean',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid request body');
    });

    it('should return 404 for unknown provider', async () => {
      const res = await app.request('/api/v1/integrations/ai/providers/unknown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          config: { apiKey: 'test' },
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/integrations/:integrationId/providers/:providerId', () => {
    it('should delete provider config', async () => {
      // Create config first
      await app.request('/api/v1/integrations/ai/providers/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          config: { apiKey: 'sk-test' },
        }),
      });

      // Delete it
      const res = await app.request('/api/v1/integrations/ai/providers/anthropic', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify it's deleted
      const checkRes = await app.request('/api/v1/integrations/ai/providers/anthropic');
      const checkBody = await checkRes.json();
      expect(checkBody.config).toBeNull();
    });

    it('should return 404 for non-existent config', async () => {
      const res = await app.request('/api/v1/integrations/sms/providers/twilio', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/integrations/:integrationId/providers/:providerId/test', () => {
    it('should return error for unconfigured provider', async () => {
      const res = await app.request('/api/v1/integrations/ai/providers/anthropic/test', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Provider not configured');
    });

    it('should test configured provider', async () => {
      // Create config first
      await app.request('/api/v1/integrations/ai/providers/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          config: { apiKey: 'sk-ant-invalid-key' },
        }),
      });

      // Test connection (will fail with invalid key, but should not error)
      const res = await app.request('/api/v1/integrations/ai/providers/anthropic/test', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Will likely fail due to invalid key
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/integrations/:integrationId/providers/:providerId/toggle', () => {
    it('should toggle provider enabled state', async () => {
      // Create config first
      await app.request('/api/v1/integrations/ai/providers/anthropic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          config: { apiKey: 'sk-test' },
        }),
      });

      // Disable it
      const res = await app.request('/api/v1/integrations/ai/providers/anthropic/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.enabled).toBe(false);
      expect(body.status).toBe('disabled');
    });

    it('should return 404 for unconfigured provider', async () => {
      const res = await app.request('/api/v1/integrations/sms/providers/twilio/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/integrations/:integrationId/logs', () => {
    it('should return empty logs for new integration', async () => {
      const res = await app.request('/api/v1/integrations/ai/logs');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.logs).toBeDefined();
      expect(Array.isArray(body.logs)).toBe(true);
    });
  });

  describe('GET /api/v1/integrations/registry', () => {
    it('should return static integration registry', async () => {
      const res = await app.request('/api/v1/integrations/registry');

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.integrations).toBeDefined();
      expect(Array.isArray(body.integrations)).toBe(true);

      // Check structure
      const aiIntegration = body.integrations.find((i: { id: string }) => i.id === 'ai');
      expect(aiIntegration).toBeDefined();
      expect(aiIntegration.providers).toBeDefined();

      // Each provider should have configSchema
      const anthropic = aiIntegration.providers.find((p: { id: string }) => p.id === 'anthropic');
      expect(anthropic.configSchema).toBeDefined();
    });
  });
});
