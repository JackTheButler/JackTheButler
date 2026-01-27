/**
 * Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to test the config module, but it caches values
// So we mock process.env and reset the module between tests

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load default configuration', async () => {
      // Vitest sets NODE_ENV to 'test' by default, so we unset it first
      delete process.env.NODE_ENV;

      const { loadConfig } = await import('@/config/index.js');
      const config = loadConfig();

      expect(config.env).toBe('development');
      expect(config.port).toBe(3000);
      expect(config.database.path).toBe('./data/jack.db');
      expect(config.log.level).toBe('info');
    });

    it('should load configuration from environment variables', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.DATABASE_PATH = '/custom/path/db.sqlite';
      process.env.LOG_LEVEL = 'debug';

      const { loadConfig } = await import('@/config/index.js');
      const config = loadConfig();

      expect(config.env).toBe('production');
      expect(config.port).toBe(8080);
      expect(config.database.path).toBe('/custom/path/db.sqlite');
      expect(config.log.level).toBe('debug');
    });

    it('should cache configuration', async () => {
      const { loadConfig } = await import('@/config/index.js');
      const config1 = loadConfig();
      const config2 = loadConfig();

      expect(config1).toBe(config2);
    });

    it('should coerce port to number', async () => {
      process.env.PORT = '4000';

      const { loadConfig } = await import('@/config/index.js');
      const config = loadConfig();

      expect(config.port).toBe(4000);
      expect(typeof config.port).toBe('number');
    });
  });

  describe('resetConfig', () => {
    it('should clear cached configuration', async () => {
      const { loadConfig, resetConfig } = await import('@/config/index.js');

      const config1 = loadConfig();
      resetConfig();

      process.env.PORT = '9999';
      vi.resetModules();
      const { loadConfig: loadConfig2 } = await import('@/config/index.js');
      const config2 = loadConfig2();

      expect(config1.port).toBe(3000);
      expect(config2.port).toBe(9999);
    });
  });

  describe('environment helpers', () => {
    it('should detect development environment', async () => {
      process.env.NODE_ENV = 'development';

      const { isDev, isProd, isTest } = await import('@/config/index.js');

      expect(isDev()).toBe(true);
      expect(isProd()).toBe(false);
      expect(isTest()).toBe(false);
    });

    it('should detect production environment', async () => {
      process.env.NODE_ENV = 'production';

      const { isDev, isProd, isTest } = await import('@/config/index.js');

      expect(isDev()).toBe(false);
      expect(isProd()).toBe(true);
      expect(isTest()).toBe(false);
    });

    it('should detect test environment', async () => {
      process.env.NODE_ENV = 'test';

      const { isDev, isProd, isTest } = await import('@/config/index.js');

      expect(isDev()).toBe(false);
      expect(isProd()).toBe(false);
      expect(isTest()).toBe(true);
    });
  });
});
