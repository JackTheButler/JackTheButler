import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');

const COOKIE = 'jane_session';

function cookieFrom(res: Response): string {
  return res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];
}

function req(path: string, cookie: string | null, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

let adminCookie = '';
let adminId = '';

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'admin@acme.co', password: 'supersecret' }),
  });
  adminCookie = cookieFrom(res);
  adminId = (await res.json()).user.id;
});

describe('staff — invite + accept', () => {
  let token = '';
  let agentId = '';
  let agentCookie = '';

  it('setup admin is role=admin, status active', async () => {
    const { members } = await (await req('/api/app/staff', adminCookie)).json();
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ role: 'admin', status: 'active', email: 'admin@acme.co' });
  });

  it('admin invites an agent → invited row + token', async () => {
    const res = await req(
      '/api/app/staff/invite',
      adminCookie,
      post({
        email: 'agent@acme.co',
        role: 'agent',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.member).toMatchObject({ email: 'agent@acme.co', role: 'agent', status: 'invited' });
    expect(typeof body.token).toBe('string');
    token = body.token;
    agentId = body.member.id;
  });

  it('rejects a duplicate invite email', async () => {
    const res = await req(
      '/api/app/staff/invite',
      adminCookie,
      post({
        email: 'agent@acme.co',
        role: 'agent',
      }),
    );
    expect(res.status).toBe(409);
  });

  it('an invited (not-yet-accepted) account cannot log in', async () => {
    const res = await req(
      '/api/auth/login',
      null,
      post({
        email: 'agent@acme.co',
        password: 'whatever123',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('accepting the invite sets a password, activates, and logs in', async () => {
    const res = await req(
      '/api/auth/accept-invite',
      null,
      post({
        token,
        name: 'Agent A',
        password: 'agentpass123',
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ role: 'agent', name: 'Agent A' });
    agentCookie = cookieFrom(res);
  });

  it('rejects a reused/invalid invite token', async () => {
    const res = await req(
      '/api/auth/accept-invite',
      null,
      post({
        token,
        name: 'X',
        password: 'password123',
      }),
    );
    expect(res.status).toBe(400);
  });

  describe('agent permissions', () => {
    it('agent CAN reach Inbox + Knowledge entries + status', async () => {
      expect((await req('/api/app/conversations', agentCookie)).status).toBe(200);
      expect((await req('/api/app/knowledge/entries', agentCookie)).status).toBe(200);
      // Status is role-agnostic so the agent's KB page renders correct hints
      // (instead of 403ing on the admin-only Apps endpoint).
      const status = await req('/api/app/status', agentCookie);
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({
        providers: { embedding: { connected: false }, generation: { connected: false } },
      });
    });

    it('agent is forbidden (403) from admin areas', async () => {
      expect((await req('/api/app/assistant', agentCookie)).status).toBe(403);
      expect((await req('/api/app/business', agentCookie)).status).toBe(403);
      expect((await req('/api/app/apps', agentCookie)).status).toBe(403);
      expect((await req('/api/app/staff', agentCookie)).status).toBe(403);
      expect((await req('/api/app/knowledge/settings', agentCookie)).status).toBe(403);
    });
  });

  describe('role + status management', () => {
    it('admin promotes the agent, then demotes back', async () => {
      const up = await req(`/api/app/staff/${agentId}/role`, adminCookie, post({ role: 'admin' }));
      expect(up.status).toBe(200);
      expect((await up.json()).role).toBe('admin');
      const down = await req(
        `/api/app/staff/${agentId}/role`,
        adminCookie,
        post({ role: 'agent' }),
      );
      expect((await down.json()).role).toBe('agent');
    });

    it('disabling blocks the existing session AND new logins; enabling restores', async () => {
      await req(`/api/app/staff/${agentId}/disable`, adminCookie, { method: 'POST' });
      // Existing cookie is now rejected (re-read finds it disabled).
      expect((await req('/api/app/conversations', agentCookie)).status).toBe(401);
      expect(
        (
          await req(
            '/api/auth/login',
            null,
            post({ email: 'agent@acme.co', password: 'agentpass123' }),
          )
        ).status,
      ).toBe(401);

      await req(`/api/app/staff/${agentId}/enable`, adminCookie, { method: 'POST' });
      expect(
        (
          await req(
            '/api/auth/login',
            null,
            post({ email: 'agent@acme.co', password: 'agentpass123' }),
          )
        ).status,
      ).toBe(200);
    });

    it('cannot demote or disable the last admin', async () => {
      const demote = await req(
        `/api/app/staff/${adminId}/role`,
        adminCookie,
        post({ role: 'agent' }),
      );
      expect(demote.status).toBe(409);
      const disable = await req(`/api/app/staff/${adminId}/disable`, adminCookie, {
        method: 'POST',
      });
      expect(disable.status).toBe(409);
    });
  });
});
