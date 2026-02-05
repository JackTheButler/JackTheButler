/**
 * App Loader Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AppLoader,
  getAppLoader,
  resetAppLoader,
  loadApps,
} from '@/apps/loader.js';
import {
  AppRegistry,
  resetAppRegistry,
} from '@/apps/registry.js';
import type { AIAppManifest } from '@/apps/types.js';

// Store original env
const originalEnv = { ...process.env };

// Factory function for mock manifest - avoids hoisting issues
function createMockAIManifest(id: string = 'anthropic'): AIAppManifest {
  return {
    id,
    name: 'Anthropic Claude',
    category: 'ai',
    version: '1.0.0',
    description: 'Test',
    configSchema: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
    capabilities: { completion: true, embedding: false },
    createProvider: vi.fn().mockReturnValue({
      name: id,
      complete: vi.fn(),
      embed: vi.fn(),
      testConnection: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
    }),
  };
}

describe('AppLoader', () => {
  let registry: AppRegistry;
  let loader: AppLoader;

  beforeEach(() => {
    resetAppRegistry();
    resetAppLoader();
    registry = new AppRegistry();
    loader = new AppLoader(registry);
    vi.clearAllMocks();
    // Reset env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('discoverApps', () => {
    it('should discover and register all manifests', () => {
      const manifests = loader.discoverApps();

      expect(manifests.length).toBeGreaterThan(0);
      expect(registry.getAll().length).toBeGreaterThan(0);
    });

    it('should filter by category', () => {
      const manifests = loader.discoverApps(['ai']);

      expect(manifests.every((m) => m.category === 'ai')).toBe(true);
    });
  });

  describe('loadFromConfig', () => {
    it('should load enabled apps', async () => {
      const mockManifest = createMockAIManifest('test-ai-1');
      registry.register(mockManifest);

      const results = await loader.loadFromConfig([
        {
          appId: 'test-ai-1',
          enabled: true,
          config: { apiKey: 'test-key' },
        },
      ]);

      expect(results.length).toBe(1);
      expect(results[0]?.success).toBe(true);
      expect(registry.get('test-ai-1')?.status).toBe('active');
    });

    it('should skip disabled apps', async () => {
      const mockManifest = createMockAIManifest('test-ai-2');
      registry.register(mockManifest);

      const results = await loader.loadFromConfig([
        {
          appId: 'test-ai-2',
          enabled: false,
          config: { apiKey: 'test-key' },
        },
      ]);

      expect(results[0]?.message).toBe('Skipped (disabled)');
      expect(registry.get('test-ai-2')?.status).toBe('registered');
    });

    it('should handle missing apps', async () => {
      const results = await loader.loadFromConfig([
        {
          appId: 'unknown',
          enabled: true,
          config: {},
        },
      ]);

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.message).toContain('not registered');
    });

    it('should respect priority ordering', async () => {
      const order: string[] = [];
      const trackingManifest = (id: string): AIAppManifest => ({
        ...createMockAIManifest(id),
        createProvider: vi.fn().mockImplementation(() => {
          order.push(id);
          return { name: id, complete: vi.fn(), embed: vi.fn() };
        }),
      });

      registry.register(trackingManifest('ext-a'));
      registry.register(trackingManifest('ext-b'));
      registry.register(trackingManifest('ext-c'));

      await loader.loadFromConfig([
        { appId: 'ext-c', enabled: true, config: { apiKey: 'k' }, priority: 3 },
        { appId: 'ext-a', enabled: true, config: { apiKey: 'k' }, priority: 1 },
        { appId: 'ext-b', enabled: true, config: { apiKey: 'k' }, priority: 2 },
      ]);

      expect(order).toEqual(['ext-a', 'ext-b', 'ext-c']);
    });

    it('should auto-discover if option is set', async () => {
      // Using real anthropic manifest from discovered apps
      const results = await loader.loadFromConfig(
        [{ appId: 'anthropic', enabled: true, config: { apiKey: 'test' } }],
        { autoDiscover: true }
      );

      expect(results.length).toBe(1);
    });
  });

  describe('loadFromEnvironment', () => {
    it('should detect Anthropic from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      const configs = loader.loadFromEnvironment({ autoDiscover: true });

      const anthropicConfig = configs.find((c) => c.appId === 'anthropic');
      expect(anthropicConfig).toBeDefined();
      expect(anthropicConfig?.config.apiKey).toBe('sk-ant-test');
    });

    it('should detect OpenAI from environment', () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const configs = loader.loadFromEnvironment({ autoDiscover: true });

      const openaiConfig = configs.find((c) => c.appId === 'openai');
      expect(openaiConfig).toBeDefined();
    });

    it('should detect Twilio from environment', () => {
      process.env.TWILIO_ACCOUNT_SID = 'ACtest';
      process.env.TWILIO_AUTH_TOKEN = 'token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      const configs = loader.loadFromEnvironment({ autoDiscover: true });

      const twilioConfig = configs.find((c) => c.appId === 'sms-twilio');
      expect(twilioConfig).toBeDefined();
      expect(twilioConfig?.config.accountSid).toBe('ACtest');
    });

    it('should detect WhatsApp from environment', () => {
      process.env.WHATSAPP_ACCESS_TOKEN = 'token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '12345';

      const configs = loader.loadFromEnvironment({ autoDiscover: true });

      const whatsappConfig = configs.find((c) => c.appId === 'whatsapp-meta');
      expect(whatsappConfig).toBeDefined();
    });

    it('should detect SMTP from environment', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_FROM_ADDRESS = 'test@example.com';

      const configs = loader.loadFromEnvironment({ autoDiscover: true });

      const smtpConfig = configs.find((c) => c.appId === 'email-smtp');
      expect(smtpConfig).toBeDefined();
    });

    it('should enable mock PMS in development', () => {
      process.env.NODE_ENV = 'development';

      const configs = loader.loadFromEnvironment({ autoDiscover: true });

      const mockPmsConfig = configs.find((c) => c.appId === 'pms-mock');
      expect(mockPmsConfig).toBeDefined();
    });

    it('should set priority - Anthropic before OpenAI', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.OPENAI_API_KEY = 'sk-test';

      const configs = loader.loadFromEnvironment({ autoDiscover: true });

      const anthropic = configs.find((c) => c.appId === 'anthropic');
      const openai = configs.find((c) => c.appId === 'openai');

      expect(anthropic?.priority).toBe(1);
      expect(openai?.priority).toBe(2);
    });
  });

  describe('autoLoad', () => {
    it('should auto-load from environment', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      const results = await loader.autoLoad();

      expect(results.some((r) => r.appId === 'anthropic')).toBe(true);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getAppLoader', () => {
      const loader1 = getAppLoader();
      const loader2 = getAppLoader();

      expect(loader1).toBe(loader2);
    });

    it('should reset on resetAppLoader', () => {
      const loader1 = getAppLoader();
      resetAppLoader();
      const loader2 = getAppLoader();

      expect(loader1).not.toBe(loader2);
    });
  });

  describe('loadApps helper', () => {
    it('should be a convenience function for autoLoad', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      const results = await loadApps();

      expect(Array.isArray(results)).toBe(true);
    });
  });
});
