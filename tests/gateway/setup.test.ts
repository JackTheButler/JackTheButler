/**
 * Setup Wizard API Tests
 *
 * Setup routes are public (no auth) until setup completes, after which the
 * gate middleware blocks everything except GET /state and POST /reset.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { app } from '@/gateway/server.js';
import { db, staff, knowledgeBase } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { getAppRegistry } from '@/apps/registry.js';
import { resetConfig } from '@/config/index.js';
import type { AIAppManifest } from '@/apps/types.js';

// A fake "local" AI provider manifest so setupService.enableLocalAI() (triggered by
// POST /start) can actually register+activate an app without loading the real
// Transformers.js models (no real network/model downloads in tests).
const fakeComplete = vi.fn();
const fakeEmbed = vi.fn();

const fakeLocalManifest: AIAppManifest = {
  id: 'local',
  name: 'Fake Local AI (test)',
  category: 'ai',
  version: '1.0.0',
  description: 'Fake local AI provider for setup route tests',
  configSchema: [],
  capabilities: { completion: true, embedding: true },
  createProvider: () => ({
    name: 'local',
    complete: fakeComplete,
    embed: fakeEmbed,
  }),
};

async function resetSetup() {
  await app.request('/api/v1/setup/reset', { method: 'POST' });
}

async function cleanupStaff(...emails: string[]) {
  for (const email of emails) {
    await db.delete(staff).where(eq(staff.email, email));
  }
}

describe('Setup API', () => {
  beforeAll(() => {
    // Register (but do not activate) the fake local manifest so getManifest('local')
    // resolves for enableLocalAI(). It only becomes 'active' once POST /start runs.
    getAppRegistry().register(fakeLocalManifest);
  });

  afterEach(async () => {
    await resetSetup();
    fakeComplete.mockReset();
    fakeEmbed.mockReset();
  });

  describe('GET /api/v1/setup/state', () => {
    it('returns pending state for a fresh install', async () => {
      const res = await app.request('/api/v1/setup/state');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('pending');
      expect(json.currentStep).toBeNull();
      expect(json.completedSteps).toEqual([]);
      expect(json.isFreshInstall).toBe(true);
    });
  });

  describe('POST /api/v1/setup/process-message (no active AI provider)', () => {
    // These run before any test activates the fake 'local' provider via POST /start,
    // so getActiveAIProvider() returns undefined and the fallback branches run.

    it('proceeds immediately for a step with no stepConfig', async () => {
      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'hello there',
          step: 'unknown_step',
          question: 'What is your name?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('proceed');
      expect(json.data.value).toBe('hello there');
    });

    it('falls back to validation when no AI provider is active (valid URL)', async () => {
      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'grandhotel.com',
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('proceed');
      expect(json.data.value).toBe('https://grandhotel.com');
    });

    it('falls back to retry when validation fails with no AI provider', async () => {
      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '\t\n',
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('retry');
      expect(json.data).toBeNull();
    });

    it('proceeds directly for a step with no validation and no AI provider', async () => {
      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Check-in 3pm, check-out 11am',
          step: 'ask_manual_checkin',
          question: 'When is check-in/out?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('proceed');
      expect(json.data.value).toBe('Check-in 3pm, check-out 11am');
    });

    it('returns 400 for an invalid body', async () => {
      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'ask_website' }), // missing message/question
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/setup/start', () => {
    it('starts the wizard and activates the local AI provider', async () => {
      const res = await app.request('/api/v1/setup/start', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('in_progress');
      expect(json.currentStep).toBe('bootstrap');
      expect(json.message).toContain('Local AI');

      // enableLocalAI() should have activated our fake manifest
      const ext = getAppRegistry().get('local');
      expect(ext?.status).toBe('active');
    });

    it('is idempotent when called again on an existing state', async () => {
      await app.request('/api/v1/setup/start', { method: 'POST' });
      const res = await app.request('/api/v1/setup/start', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('in_progress');
      expect(json.currentStep).toBe('bootstrap');
    });
  });

  describe('POST /api/v1/setup/bootstrap', () => {
    it('completes the bootstrap step and moves to welcome', async () => {
      await app.request('/api/v1/setup/start', { method: 'POST' });

      const res = await app.request('/api/v1/setup/bootstrap', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.currentStep).toBe('welcome');
      expect(json.completedSteps).toContain('bootstrap');
      expect(json.status).toBe('in_progress');
    });

    it('persists correctly even if the setup_state row is missing (e.g. right after POST /reset)', async () => {
      // completeStep() now upserts the 'setup' row instead of issuing a plain UPDATE,
      // so this no longer silently no-ops when called before POST /start has ever
      // INSERTed the row.
      const res = await app.request('/api/v1/setup/bootstrap', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.currentStep).toBe('welcome');
      expect(json.completedSteps).toContain('bootstrap');
      expect(json.status).toBe('in_progress');

      const stateRes = await app.request('/api/v1/setup/state');
      const stateJson = await stateRes.json();
      expect(stateJson.currentStep).toBe('welcome');
      expect(stateJson.completedSteps).toContain('bootstrap');
    });
  });

  describe('POST /api/v1/setup/welcome', () => {
    it('returns 400 when name is missing', async () => {
      const res = await app.request('/api/v1/setup/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'hotel' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for an invalid property type', async () => {
      const res = await app.request('/api/v1/setup/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Grand Hotel', type: 'castle' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.message).toContain('property type');
    });

    it('saves property info and moves to ai_provider step', async () => {
      // See NOTE above: the setup_state row must exist for completeStep() to persist.
      await app.request('/api/v1/setup/start', { method: 'POST' });

      const res = await app.request('/api/v1/setup/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '  Grand Hotel  ', type: 'hotel' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.currentStep).toBe('ai_provider');
      expect(json.completedSteps).toContain('property_type');
      expect(json.context.propertyName).toBe('Grand Hotel');
      expect(json.context.propertyType).toBe('hotel');
    });
  });

  describe('POST /api/v1/setup/ai-provider', () => {
    it('returns 400 when provider is missing/invalid', async () => {
      const res = await app.request('/api/v1/setup/ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'bogus' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when apiKey is missing for a cloud provider', async () => {
      const res = await app.request('/api/v1/setup/ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.message).toContain('API key is required');
    });

    it('configures the local provider and completes setup (moves to knowledge)', async () => {
      // See NOTE above: the setup_state row must exist for completeStep() to persist.
      await app.request('/api/v1/setup/start', { method: 'POST' });

      const res = await app.request('/api/v1/setup/ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'local' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.currentStep).toBe('knowledge');
      expect(json.context.aiProvider).toBe('local');
      expect(json.context.aiConfigured).toBe(true);
    });

    it('returns 400 when the cloud provider manifest is not registered', async () => {
      // 'anthropic' is a plugin package that is never discovered/registered in this
      // test environment (discoverApps() is never invoked), so appConfigService
      // .saveAppConfig() throws NotFoundError, which configureAIProvider() surfaces
      // as a validation failure rather than a 500.
      const res = await app.request('/api/v1/setup/ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic', apiKey: 'sk-test-123' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('AI_VALIDATION_FAILED');
      expect(json.error.message).toContain('not found');
    });
  });

  describe('POST /api/v1/setup/knowledge/complete', () => {
    it('completes the knowledge step and moves to create_admin', async () => {
      // See NOTE above: the setup_state row must exist for completeStep() to persist.
      await app.request('/api/v1/setup/start', { method: 'POST' });

      const res = await app.request('/api/v1/setup/knowledge/complete', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.currentStep).toBe('create_admin');
      expect(json.completedSteps).toContain('knowledge');
    });
  });

  describe('POST /api/v1/setup/create-admin', () => {
    afterEach(async () => {
      await cleanupStaff('new-admin@settest.com', 'existing-admin@settest.com', 'default-admin@settest.com');
    });

    it('returns 400 when email is missing', async () => {
      const res = await app.request('/api/v1/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password123', name: 'Admin' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain('Email is required');
    });

    it('returns 400 for an invalid email format', async () => {
      const res = await app.request('/api/v1/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: 'password123', name: 'Admin' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain('valid email');
    });

    it('returns 400 when password is missing', async () => {
      const res = await app.request('/api/v1/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new-admin@settest.com', name: 'Admin' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain('Password is required');
    });

    it('returns 400 when password is too short', async () => {
      const res = await app.request('/api/v1/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new-admin@settest.com', password: 'short', name: 'Admin' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain('at least 8 characters');
    });

    it('returns 400 when name is missing or too short', async () => {
      const res = await app.request('/api/v1/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new-admin@settest.com', password: 'password123', name: 'A' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain('Name is required');
    });

    it('returns 400 when the email is already in use', async () => {
      await db.insert(staff).values({
        id: 'settest-existing-admin',
        email: 'existing-admin@settest.com',
        name: 'Existing',
        roleId: 'role-admin',
        status: 'active',
        passwordHash: null,
      });

      const res = await app.request('/api/v1/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing-admin@settest.com',
          password: 'password123',
          name: 'Someone Else',
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('ADMIN_CREATION_FAILED');
      expect(json.error.message).toContain('already in use');

      await db.delete(staff).where(eq(staff.id, 'settest-existing-admin'));
    });

    it('creates the admin, disables the default admin, and completes setup', async () => {
      // See NOTE above: the setup_state row must exist for completeStep() to persist.
      await app.request('/api/v1/setup/start', { method: 'POST' });

      // A default admin (id 'staff-admin-butler') is seeded by the initial migration
      // (migrations/0000_cold_dust.sql) — it already exists, no need to create it.
      const res = await app.request('/api/v1/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'New-Admin@SetTest.com',
          password: 'password123',
          name: '  New Admin  ',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('completed');
      expect(json.currentStep).toBeNull();
      expect(json.completedSteps).toContain('create_admin');

      const created = await db
        .select()
        .from(staff)
        .where(eq(staff.email, 'new-admin@settest.com'))
        .get();
      expect(created).toBeDefined();
      expect(created?.name).toBe('New Admin');
      expect(created?.roleId).toBe('role-admin');
      expect(created?.status).toBe('active');

      const defaultAdmin = await db
        .select()
        .from(staff)
        .where(eq(staff.id, 'staff-admin-butler'))
        .get();
      expect(defaultAdmin?.status).toBe('inactive');

      // Restore the default admin so it doesn't leak 'inactive' into other tests in this file.
      await db.update(staff).set({ status: 'active' }).where(eq(staff.id, 'staff-admin-butler'));
    });
  });

  describe('POST /api/v1/setup/process-message (with active AI provider)', () => {
    beforeAll(async () => {
      // Ensure the fake 'local' provider is active for this whole block.
      await app.request('/api/v1/setup/start', { method: 'POST' });
    });

    it('proceeds with the extracted+validated value on intent=answer', async () => {
      fakeComplete.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: 'answer',
          response: 'Got it!',
          extractedValue: 'jackthebutler.com',
        }),
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'our site is jackthebutler.com',
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('proceed');
      expect(json.data.value).toBe('https://jackthebutler.com');
      expect(fakeComplete).toHaveBeenCalledTimes(1);
    });

    it('retries when the extracted value fails validation', async () => {
      fakeComplete.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: 'answer',
          response: 'Hmm, that does not look right.',
          extractedValue: '::::not a url::::',
        }),
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'garbage',
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('retry');
      expect(json.data).toBeNull();
    });

    it('proceeds with the raw extracted value for a step without validation', async () => {
      fakeComplete.mockResolvedValueOnce({
        content: JSON.stringify({
          intent: 'answer',
          response: 'Thanks!',
          extractedValue: 'Check-in 3pm / Check-out 11am',
        }),
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'checkin is 3, checkout is 11',
          step: 'ask_manual_checkin',
          question: 'When is check-in/out?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('proceed');
      expect(json.data.value).toBe('Check-in 3pm / Check-out 11am');
    });

    it('shows a message and stays on step for intent=question', async () => {
      fakeComplete.mockResolvedValueOnce({
        content: JSON.stringify({ intent: 'question', response: 'Why do you need this?' }),
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'why do you need my website?',
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('show_message');
      expect(json.stayOnStep).toBe(true);
    });

    it('skips to the next step for intent=skip when canSkip is true', async () => {
      fakeComplete.mockResolvedValueOnce({
        content: JSON.stringify({ intent: 'skip', response: "No problem, we'll skip that." }),
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: "I don't have a website",
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('skip');
      expect(json.nextStep).toBe('ask_manual_checkin');
    });

    it('refuses to skip and stays on step when canSkip is false', async () => {
      fakeComplete.mockResolvedValueOnce({
        content: JSON.stringify({ intent: 'skip', response: 'This one is required, sorry!' }),
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'skip this',
          step: 'ask_manual_checkin',
          question: 'When is check-in/out?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('show_message');
      expect(json.stayOnStep).toBe(true);
    });

    it('shows a message for intent=unclear', async () => {
      fakeComplete.mockResolvedValueOnce({
        content: JSON.stringify({ intent: 'unclear', response: 'Sorry, could you clarify?' }),
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'asdkjaslkdj',
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('show_message');
    });

    it('falls back to proceed when the AI response has no JSON', async () => {
      fakeComplete.mockResolvedValueOnce({
        content: 'not json at all',
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'raw message',
          step: 'ask_manual_room',
          question: 'Tell me about your rooms',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('proceed');
      expect(json.data.value).toBe('raw message');
    });

    it('falls back to validation-based proceed when the AI call throws but input is valid', async () => {
      fakeComplete.mockRejectedValueOnce(new Error('provider exploded'));

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'grandhotel.com',
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('proceed');
      expect(json.data.value).toBe('https://grandhotel.com');
    });

    it('falls back to validation-based retry when the AI call throws and input is invalid', async () => {
      fakeComplete.mockRejectedValueOnce(new Error('provider exploded'));

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'not a url at all::::',
          step: 'ask_website',
          question: 'What is your website?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('retry');
      expect(json.data).toBeNull();
    });

    it('falls back to a generic retry message when the AI call throws for a step without validation', async () => {
      fakeComplete.mockRejectedValueOnce(new Error('provider exploded'));

      const res = await app.request('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'contact info',
          step: 'ask_manual_contact',
          question: 'What is your contact info?',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('retry');
      expect(json.message).toContain('trouble understanding');
    });
  });

  describe('POST /api/v1/setup/sync-profile', () => {
    afterEach(async () => {
      await db.delete(knowledgeBase);
    });

    it('returns the default profile when there is no knowledge base data', async () => {
      const res = await app.request('/api/v1/setup/sync-profile', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.profile.checkInTime).toBe('15:00');
      expect(json.profile.checkOutTime).toBe('11:00');
    });

    it('extracts check-in/out times, contact info, and address from knowledge entries', async () => {
      await db.insert(knowledgeBase).values([
        {
          id: 'kb-policy-1',
          category: 'policy',
          title: 'Check-in policy',
          content: 'Check-in: 3:00pm, Check-out: 10:30am',
        },
        {
          id: 'kb-contact-1',
          category: 'contact',
          title: 'Contact us',
          content: 'Call us at 555-123-4567 or email frontdesk@grandhotel.example',
        },
        {
          id: 'kb-local-1',
          category: 'local_info',
          title: 'Address',
          content: '123 Ocean Avenue, Beachtown, CA 90210, near the pier',
        },
      ]);

      const res = await app.request('/api/v1/setup/sync-profile', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.profile.checkInTime).toBe('15:00');
      expect(json.profile.checkOutTime).toBe('10:30');
      expect(json.profile.contactPhone).toContain('555-123-4567');
      expect(json.profile.contactEmail).toBe('frontdesk@grandhotel.example');
      expect(json.profile.address).toContain('123 Ocean Avenue');
    });
  });

  describe('POST /api/v1/setup/skip', () => {
    it('marks setup as completed', async () => {
      const res = await app.request('/api/v1/setup/skip', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('completed');
      expect(json.message).toBe('Setup skipped');
    });
  });

  describe('POST /api/v1/setup/reset', () => {
    it('resets setup state back to pending', async () => {
      await app.request('/api/v1/setup/skip', { method: 'POST' });

      const res = await app.request('/api/v1/setup/reset', { method: 'POST' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('pending');
    });

    it('is forbidden in production', async () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      resetConfig();

      try {
        const res = await app.request('/api/v1/setup/reset', { method: 'POST' });
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.error.code).toBe('FORBIDDEN');
      } finally {
        process.env.NODE_ENV = original;
        resetConfig();
      }
    });
  });

  describe('completion gate', () => {
    it('blocks setup-modifying routes once completed but still allows GET /state and POST /reset', async () => {
      await app.request('/api/v1/setup/skip', { method: 'POST' });

      const blocked = await app.request('/api/v1/setup/bootstrap', { method: 'POST' });
      expect(blocked.status).toBe(403);
      const blockedJson = await blocked.json();
      expect(blockedJson.error.code).toBe('SETUP_ALREADY_COMPLETED');

      const welcomeBlocked = await app.request('/api/v1/setup/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X', type: 'hotel' }),
      });
      expect(welcomeBlocked.status).toBe(403);

      const stateRes = await app.request('/api/v1/setup/state');
      expect(stateRes.status).toBe(200);
      expect((await stateRes.json()).status).toBe('completed');

      const resetRes = await app.request('/api/v1/setup/reset', { method: 'POST' });
      expect(resetRes.status).toBe(200);
      expect((await resetRes.json()).status).toBe('pending');
    });
  });
});
