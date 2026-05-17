import { describe, it, expect } from 'vitest';
import { app } from '../src/index.js';

describe('API', () => {
  it('GET /health returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /api/ping returns pong', async () => {
    const res = await app.request('/api/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'pong' });
  });
});
