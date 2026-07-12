/**
 * Setup Service Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db, setupState, knowledgeBase, staff } from '@/db/index.js';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { authService } from '@/auth/auth.js';
import { settingsService } from '@/services/settings.js';

// Mock the app config service — setup.ts calls saveAppConfig/testAppConnection/setAppEnabled
// as part of the AI provider bootstrap/config flow. We never want real network calls or
// real provider activation here.
vi.mock('@/apps/config.js', () => ({
  appConfigService: {
    saveAppConfig: vi.fn().mockResolvedValue({}),
    testAppConnection: vi.fn().mockResolvedValue({ success: true }),
    setAppEnabled: vi.fn().mockResolvedValue(null),
  },
}));

// Mock app registry lookups used directly by SetupService#enableLocalAI
const mockRegistry = {
  get: vi.fn(() => undefined),
  register: vi.fn(),
  activate: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/apps/index.js', () => ({
  getAppRegistry: vi.fn(() => mockRegistry),
  getManifest: vi.fn(() => undefined),
}));

// Import after mocks are set up
import { SetupService } from '@/services/setup.js';
import { appConfigService } from '@/apps/config.js';

const HOTEL_PROFILE_KEY = 'hotel_profile';

describe('SetupService', () => {
  let service: SetupService;

  beforeEach(async () => {
    service = new SetupService();
    vi.clearAllMocks();
    (appConfigService.saveAppConfig as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (appConfigService.testAppConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    (appConfigService.setAppEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    mockRegistry.get.mockReturnValue(undefined);
    mockRegistry.activate.mockResolvedValue(undefined);

    await db.delete(setupState).where(eq(setupState.id, 'setup'));
    await db.delete(knowledgeBase);
    await db.delete(staff).where(eq(staff.id, 'staff-admin-butler'));
    await db.delete(staff).where(eq(staff.email, 'new-admin@test.com'));
    await settingsService.delete(HOTEL_PROFILE_KEY);
  });

  afterEach(async () => {
    await db.delete(setupState).where(eq(setupState.id, 'setup'));
    await db.delete(knowledgeBase);
    await db.delete(staff).where(eq(staff.id, 'staff-admin-butler'));
    await db.delete(staff).where(eq(staff.email, 'new-admin@test.com'));
    await settingsService.delete(HOTEL_PROFILE_KEY);
  });

  describe('isFreshInstall', () => {
    it('should return true when no setup state exists', async () => {
      expect(await service.isFreshInstall()).toBe(true);
    });

    it('should return true when status is in_progress', async () => {
      await service.start();
      expect(await service.isFreshInstall()).toBe(true);
    });

    it('should return false when status is completed', async () => {
      await service.skip();
      expect(await service.isFreshInstall()).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return initial pending state when nothing persisted', async () => {
      const state = await service.getState();

      expect(state.status).toBe('pending');
      expect(state.currentStep).toBeNull();
      expect(state.completedSteps).toEqual([]);
      expect(state.context).toEqual({});
    });

    it('should return persisted state after start', async () => {
      await service.start();
      const state = await service.getState();

      expect(state.status).toBe('in_progress');
      expect(state.currentStep).toBe('bootstrap');
    });
  });

  describe('start', () => {
    it('should create setup state and enable Local AI', async () => {
      const state = await service.start();

      expect(state.status).toBe('in_progress');
      expect(state.currentStep).toBe('bootstrap');
      expect(appConfigService.saveAppConfig).toHaveBeenCalledWith(
        'local',
        { embeddingModel: 'Xenova/all-MiniLM-L6-v2' },
        true
      );
      expect(mockRegistry.activate).toHaveBeenCalledWith('local', {
        embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      });
    });

    it('should update existing state when called again', async () => {
      await service.start();
      // Move to a later step, then start() again
      await service.completeBootstrap();

      const state = await service.start();

      expect(state.status).toBe('in_progress');
      expect(state.currentStep).toBe('bootstrap');
    });

    it('should register manifest in registry when not already registered', async () => {
      const { getManifest } = await import('@/apps/index.js');
      (getManifest as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'local' });
      mockRegistry.get.mockReturnValue(undefined);

      await service.start();

      expect(mockRegistry.register).toHaveBeenCalledWith({ id: 'local' });
    });

    it('should not fail setup when Local AI activation throws', async () => {
      mockRegistry.activate.mockRejectedValueOnce(new Error('activation failed'));

      const state = await service.start();

      expect(state.status).toBe('in_progress');
    });
  });

  describe('completeBootstrap', () => {
    it('should move from bootstrap to welcome', async () => {
      await service.start();
      const state = await service.completeBootstrap();

      expect(state.currentStep).toBe('welcome');
      expect(state.completedSteps).toContain('bootstrap');
      expect(state.status).toBe('in_progress');
    });
  });

  describe('completeStep', () => {
    it('should not duplicate a step already in completedSteps', async () => {
      await service.start();
      await service.completeStep('bootstrap', 'welcome');
      const state = await service.completeStep('bootstrap', 'welcome');

      expect(state.completedSteps.filter((s) => s === 'bootstrap')).toHaveLength(1);
    });

    it('should mark status completed when nextStep is null', async () => {
      await service.start();
      const state = await service.completeStep('create_admin', null);

      expect(state.status).toBe('completed');
      expect(state.currentStep).toBeNull();
    });
  });

  describe('savePropertyName', () => {
    it('should save property name to context and move to property_type step', async () => {
      await service.start();
      const state = await service.savePropertyName('Grand Hotel');

      expect(state.context.propertyName).toBe('Grand Hotel');
      expect(state.currentStep).toBe('property_type');
      expect(state.completedSteps).toContain('property_name');
    });
  });

  describe('savePropertyInfo', () => {
    it('should save name/type to hotel profile and context, and move to ai_provider step', async () => {
      await service.start();
      const state = await service.savePropertyInfo('Grand Hotel', 'hotel');

      expect(state.context.propertyName).toBe('Grand Hotel');
      expect(state.context.propertyType).toBe('hotel');
      expect(state.currentStep).toBe('ai_provider');

      const profile = await settingsService.get<{ name: string; propertyType: string } | null>(
        HOTEL_PROFILE_KEY,
        null
      );
      expect(profile?.name).toBe('Grand Hotel');
      expect(profile?.propertyType).toBe('hotel');
    });

    it('should preserve existing hotel profile fields (defaults) when saving', async () => {
      await service.start();
      await service.savePropertyInfo('Grand Hotel', 'bnb');

      const profile = await settingsService.get<{ checkInTime: string; currency: string } | null>(
        HOTEL_PROFILE_KEY,
        null
      );
      expect(profile?.checkInTime).toBe('15:00');
      expect(profile?.currency).toBe('USD');
    });
  });

  describe('configureAIProvider', () => {
    it('should configure local provider without validation and move to knowledge step', async () => {
      await service.start();
      const result = await service.configureAIProvider('local');

      expect(result.success).toBe(true);
      expect(result.state.context.aiProvider).toBe('local');
      expect(result.state.context.aiConfigured).toBe(true);
      expect(result.state.currentStep).toBe('knowledge');
      expect(appConfigService.testAppConnection).not.toHaveBeenCalled();
    });

    it('should validate and save cloud provider api key on success', async () => {
      await service.start();
      const result = await service.configureAIProvider('anthropic', 'sk-test-key');

      expect(result.success).toBe(true);
      expect(appConfigService.saveAppConfig).toHaveBeenCalledWith(
        'anthropic',
        { apiKey: 'sk-test-key' },
        true
      );
      expect(appConfigService.testAppConnection).toHaveBeenCalledWith('anthropic');
      expect(result.state.currentStep).toBe('knowledge');
    });

    it('should return failure and disable provider when validation fails', async () => {
      (appConfigService.testAppConnection as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        message: 'Invalid API key',
      });

      await service.start();
      const result = await service.configureAIProvider('openai', 'bad-key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
      expect(appConfigService.setAppEnabled).toHaveBeenCalledWith('openai', false);
      // Step should not have progressed past ai_provider since validation failed
      expect(result.state.currentStep).not.toBe('knowledge');
    });

    it('should skip validation when no apiKey provided for cloud provider', async () => {
      await service.start();
      const result = await service.configureAIProvider('anthropic');

      expect(result.success).toBe(true);
      expect(appConfigService.testAppConnection).not.toHaveBeenCalled();
      expect(result.state.context.aiProvider).toBe('anthropic');
    });
  });

  describe('completeKnowledge', () => {
    it('should move from knowledge to create_admin', async () => {
      await service.start();
      const state = await service.completeKnowledge();

      expect(state.currentStep).toBe('create_admin');
      expect(state.completedSteps).toContain('knowledge');
    });
  });

  describe('createAdminAccount', () => {
    it('should create a new admin account and complete setup', async () => {
      await service.start();

      const result = await service.createAdminAccount(
        'new-admin@test.com',
        'password123',
        'New Admin'
      );

      expect(result.success).toBe(true);
      expect(result.state.status).toBe('completed');
      expect(result.state.currentStep).toBeNull();
      expect(result.state.context.adminCreated).toBe(true);

      const created = await db
        .select()
        .from(staff)
        .where(eq(staff.email, 'new-admin@test.com'))
        .get();
      expect(created).toBeDefined();
      expect(created?.roleId).toBe(SYSTEM_ROLE_IDS.ADMIN);
      expect(created?.status).toBe('active');
    });

    it('should disable the default admin account if present', async () => {
      const passwordHash = await authService.hashPassword('defaultpw123');
      await db.insert(staff).values({
        id: 'staff-admin-butler',
        email: 'default-admin@test.com',
        name: 'Default Admin',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      });

      await service.start();
      await service.createAdminAccount('new-admin@test.com', 'password123', 'New Admin');

      const defaultAdmin = await db
        .select()
        .from(staff)
        .where(eq(staff.id, 'staff-admin-butler'))
        .get();
      expect(defaultAdmin?.status).toBe('inactive');
    });

    it('should reject when email is already used by a non-default account', async () => {
      const passwordHash = await authService.hashPassword('existingpw123');
      await db.insert(staff).values({
        id: 'staff-existing-user',
        email: 'taken@test.com',
        name: 'Existing User',
        roleId: SYSTEM_ROLE_IDS.STAFF,
        status: 'active',
        passwordHash,
      });

      await service.start();
      const result = await service.createAdminAccount('taken@test.com', 'password123', 'New Admin');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email address is already in use');

      await db.delete(staff).where(eq(staff.id, 'staff-existing-user'));
    });

    it('BUG: reusing the default admin email fails on a UNIQUE constraint even though the id check allows it through', async () => {
      // createAdminAccount() special-cases existingUser.id === 'staff-admin-butler' to allow
      // "re-using" the default admin's email address. But it then INSERTs a brand-new staff
      // row with that same email *before* disabling/removing the old default-admin row, and
      // staff.email has a UNIQUE constraint. So in practice this path always fails with a
      // UNIQUE constraint violation, caught by the try/catch and surfaced as a generic error
      // rather than the intended "in use" validation message. Documenting current behavior.
      const passwordHash = await authService.hashPassword('defaultpw123');
      await db.insert(staff).values({
        id: 'staff-admin-butler',
        email: 'default-admin@test.com',
        name: 'Default Admin',
        roleId: SYSTEM_ROLE_IDS.ADMIN,
        status: 'active',
        passwordHash,
      });

      await service.start();
      const result = await service.createAdminAccount(
        'default-admin@test.com',
        'password123',
        'New Admin'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('UNIQUE constraint failed');
    });

    it('should return a failure result when an error occurs during creation', async () => {
      const spy = vi
        .spyOn(authService, 'hashPassword')
        .mockRejectedValueOnce(new Error('hash failure'));

      await service.start();
      const result = await service.createAdminAccount(
        'new-admin@test.com',
        'password123',
        'New Admin'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('hash failure');

      spy.mockRestore();
    });
  });

  describe('syncProfileFromKnowledge', () => {
    it('should extract check-in/check-out times from policy entries', async () => {
      await db.insert(knowledgeBase).values({
        id: 'kb-policy-1',
        category: 'policy',
        title: 'Check-in policy',
        content: 'Check-in time is at 3pm and check-out is by 11am.',
      });

      const profile = await service.syncProfileFromKnowledge();

      expect(profile.checkInTime).toBe('15:00');
      expect(profile.checkOutTime).toBe('11:00');
    });

    it('should extract 24-hour format times', async () => {
      await db.insert(knowledgeBase).values({
        id: 'kb-policy-2',
        category: 'policy',
        title: 'Check-in policy',
        content: 'check in at 15:00, check-out: 11:00',
      });

      const profile = await service.syncProfileFromKnowledge();

      expect(profile.checkInTime).toBe('15:00');
      expect(profile.checkOutTime).toBe('11:00');
    });

    it('should extract phone and email from contact entries', async () => {
      await db.insert(knowledgeBase).values({
        id: 'kb-contact-1',
        category: 'contact',
        title: 'Contact info',
        content: 'Call us at 415-555-1234 or email FrontDesk@Hotel.com',
      });

      const profile = await service.syncProfileFromKnowledge();

      expect(profile.contactPhone).toBe('415-555-1234');
      expect(profile.contactEmail).toBe('frontdesk@hotel.com');
    });

    it('should extract address from local_info entries', async () => {
      await db.insert(knowledgeBase).values({
        id: 'kb-local-1',
        category: 'local_info',
        title: 'Location',
        content: '123 Main Street, Springfield, USA - near the river',
      });

      const profile = await service.syncProfileFromKnowledge();

      expect(profile.address).toContain('123 Main Street');
    });

    it('should skip short local_info entries for address extraction', async () => {
      await db.insert(knowledgeBase).values({
        id: 'kb-local-2',
        category: 'local_info',
        title: 'Location',
        content: 'short',
      });

      const profile = await service.syncProfileFromKnowledge();

      expect(profile.address).toBeUndefined();
    });

    it('should leave times unchanged when policy content has no parseable time', async () => {
      await db.insert(knowledgeBase).values({
        id: 'kb-policy-3',
        category: 'policy',
        title: 'Pets policy',
        content: 'Pets are welcome at our property.',
      });

      const profile = await service.syncProfileFromKnowledge();

      expect(profile.checkInTime).toBe('15:00');
      expect(profile.checkOutTime).toBe('11:00');
    });

    it('should persist the synced profile', async () => {
      await db.insert(knowledgeBase).values({
        id: 'kb-policy-4',
        category: 'policy',
        title: 'Check-in policy',
        content: 'Check-in: 2:00pm',
      });

      await service.syncProfileFromKnowledge();

      const stored = await settingsService.get<{ checkInTime: string } | null>(
        HOTEL_PROFILE_KEY,
        null
      );
      expect(stored?.checkInTime).toBe('14:00');
    });
  });

  describe('skip', () => {
    it('should mark setup as completed when no prior state exists', async () => {
      const state = await service.skip();

      expect(state.status).toBe('completed');
      expect(state.currentStep).toBeNull();
    });

    it('should mark existing in-progress state as completed', async () => {
      await service.start();
      const state = await service.skip();

      expect(state.status).toBe('completed');
      expect(state.currentStep).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear setup state, hotel profile, and knowledge base', async () => {
      await service.start();
      await service.savePropertyInfo('Grand Hotel', 'hotel');
      await db.insert(knowledgeBase).values({
        id: 'kb-reset-1',
        category: 'faq',
        title: 'FAQ',
        content: 'Some FAQ content',
      });

      const state = await service.reset();

      expect(state.status).toBe('pending');
      expect(state.currentStep).toBeNull();

      const profile = await settingsService.get<{ name: string } | null>(HOTEL_PROFILE_KEY, null);
      expect(profile).toBeNull();

      const kbEntries = await db.select().from(knowledgeBase);
      expect(kbEntries).toHaveLength(0);

      const stateRow = await db.select().from(setupState).where(eq(setupState.id, 'setup')).get();
      expect(stateRow).toBeUndefined();
    });
  });
});
