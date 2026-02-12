/**
 * Health Routes Tests
 */

import { describe, it, expect } from 'vitest';
import { app } from '@/gateway/server.js';

describe('Health Routes', () => {
  describe('GET /health/live', () => {
    it('should return ok status', async () => {
      const res = await app.request('/health/live');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('ok');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready status with database check', async () => {
      const res = await app.request('/health/ready');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('ready');
      expect(json.checks.database).toBe('ok');
    });
  });

  describe('GET /health', () => {
    it('should return detailed health info', async () => {
      const res = await app.request('/health');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('healthy');
      expect(json.version).toBe('1.0.0');
      expect(json.uptime).toBeGreaterThan(0);
      expect(json.checks.database).toBe('ok');
    });
  });
});

describe('Root Route', () => {
  describe('GET /', () => {
    it('should return app info', async () => {
      const res = await app.request('/');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.name).toBe('Jack The Butler');
      expect(json.version).toBe('1.0.0');
      expect(json.status).toBe('running');
    });
  });
});

describe('404 Handler', () => {
  it('should return 404 for unknown API routes', async () => {
    const res = await app.request('/api/v1/unknown/route');
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});
