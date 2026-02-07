/**
 * Setup Service
 *
 * Manages the setup wizard state for fresh installations.
 * Handles Local AI bootstrapping and property info collection.
 *
 * @module services/setup
 */

import { eq } from 'drizzle-orm';
import { db, setupState, settings, knowledgeBase, staff } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';
import { appConfigService } from './app-config.js';
import { getAppRegistry, getManifest } from '@/apps/index.js';

const log = createLogger('service:setup');

/**
 * Hotel profile settings key
 */
const HOTEL_PROFILE_KEY = 'hotel_profile';

/**
 * Hotel profile interface (matches hotel-profile.ts schema)
 */
interface HotelProfile {
  name: string;
  propertyType?: PropertyType;
  address?: string;
  city?: string;
  country?: string;
  timezone: string;
  currency: string;
  checkInTime: string;
  checkOutTime: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
}

/**
 * Default hotel profile
 */
const DEFAULT_HOTEL_PROFILE: HotelProfile = {
  name: '',
  timezone: 'UTC',
  currency: 'USD',
  checkInTime: '15:00',
  checkOutTime: '11:00',
};

/**
 * Setup status values
 */
export type SetupStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Setup steps
 */
export type SetupStep = 'bootstrap' | 'welcome' | 'property_name' | 'property_type' | 'ai_provider' | 'knowledge' | 'create_admin';

/**
 * Property types
 */
export type PropertyType = 'hotel' | 'bnb' | 'vacation_rental' | 'other';

/**
 * AI provider types for setup
 */
export type AIProviderType = 'local' | 'anthropic' | 'openai';

/**
 * Setup state record
 */
export interface SetupStateRecord {
  id: string;
  status: SetupStatus;
  currentStep: SetupStep | null;
  completedSteps: SetupStep[];
  context: SetupContext;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Context data collected during setup
 */
export interface SetupContext {
  propertyName?: string;
  propertyType?: PropertyType;
  localAiEnabled?: boolean;
  aiProvider?: AIProviderType;
  aiConfigured?: boolean;
  adminCreated?: boolean;
}

/**
 * Setup Service
 *
 * Manages the setup wizard lifecycle:
 * - Checks if this is a fresh install
 * - Tracks setup progress through steps
 * - Enables Local AI during bootstrap
 * - Saves property information
 */
export class SetupService {
  /**
   * Check if this is a fresh install (setup not completed)
   */
  async isFreshInstall(): Promise<boolean> {
    const state = await this.getStateRecord();

    if (!state) {
      return true;
    }

    return state.status !== 'completed';
  }

  /**
   * Get current setup state
   */
  async getState(): Promise<SetupStateRecord> {
    const state = await this.getStateRecord();

    if (!state) {
      return this.createInitialState();
    }

    return this.dbToRecord(state);
  }

  /**
   * Start the setup wizard
   * Enables Local AI provider and sets status to in_progress
   */
  async start(): Promise<SetupStateRecord> {
    const now = new Date().toISOString();

    // Check if state exists
    const existing = await this.getStateRecord();

    if (existing) {
      // Update existing state
      await db
        .update(setupState)
        .set({
          status: 'in_progress',
          currentStep: 'bootstrap',
          updatedAt: now,
        })
        .where(eq(setupState.id, 'setup'))
        .run();
    } else {
      // Create new state
      await db
        .insert(setupState)
        .values({
          id: 'setup',
          status: 'in_progress',
          currentStep: 'bootstrap',
          completedSteps: '[]',
          context: '{}',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    // Enable Local AI provider
    await this.enableLocalAI();

    log.info('Setup started, Local AI enabled');

    return this.getState();
  }

  /**
   * Complete the bootstrap step
   * Moves to welcome step
   */
  async completeBootstrap(): Promise<SetupStateRecord> {
    return this.completeStep('bootstrap', 'welcome');
  }

  /**
   * Complete a step and move to the next
   */
  async completeStep(
    step: SetupStep,
    nextStep: SetupStep | null
  ): Promise<SetupStateRecord> {
    const state = await this.getState();
    const completedSteps = [...state.completedSteps];

    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
    }

    const now = new Date().toISOString();
    const newStatus: SetupStatus = nextStep ? 'in_progress' : 'completed';

    await db
      .update(setupState)
      .set({
        status: newStatus,
        currentStep: nextStep,
        completedSteps: JSON.stringify(completedSteps),
        updatedAt: now,
      })
      .where(eq(setupState.id, 'setup'))
      .run();

    log.info({ step, nextStep, status: newStatus }, 'Setup step completed');

    return this.getState();
  }

  /**
   * Save property name and move to property type step
   */
  async savePropertyName(name: string): Promise<SetupStateRecord> {
    const state = await this.getState();
    const context: SetupContext = {
      ...state.context,
      propertyName: name,
    };

    const now = new Date().toISOString();

    await db
      .update(setupState)
      .set({
        context: JSON.stringify(context),
        updatedAt: now,
      })
      .where(eq(setupState.id, 'setup'))
      .run();

    return this.completeStep('property_name', 'property_type');
  }

  /**
   * Save property info (name and type) to hotel_profile and move to AI provider step
   */
  async savePropertyInfo(
    name: string,
    type: PropertyType
  ): Promise<SetupStateRecord> {
    const now = new Date().toISOString();

    // Get existing hotel profile or create default
    const profile = await this.getHotelProfile();

    // Update with property info
    const updatedProfile = {
      ...profile,
      name,
      propertyType: type,
    };

    // Save to hotel_profile
    await this.saveHotelProfile(updatedProfile);

    // Update context
    const state = await this.getState();
    const context: SetupContext = {
      ...state.context,
      propertyName: name,
      propertyType: type,
    };

    await db
      .update(setupState)
      .set({
        context: JSON.stringify(context),
        updatedAt: now,
      })
      .where(eq(setupState.id, 'setup'))
      .run();

    log.info({ name, type }, 'Property info saved to hotel_profile');

    // Move to AI provider step
    return this.completeStep('property_type', 'ai_provider');
  }

  /**
   * Configure AI provider and complete setup
   */
  async configureAIProvider(
    provider: AIProviderType,
    apiKey?: string
  ): Promise<{ success: boolean; error?: string; state: SetupStateRecord }> {
    const now = new Date().toISOString();

    // If using cloud provider, validate and save the API key
    if (provider !== 'local' && apiKey) {
      const validation = await this.validateAndSaveAIProvider(provider, apiKey);
      if (!validation.success) {
        const state = await this.getState();
        return { success: false, error: validation.error || 'Validation failed', state };
      }
    }

    // Update context
    const state = await this.getState();
    const context: SetupContext = {
      ...state.context,
      aiProvider: provider,
      aiConfigured: true,
    };

    await db
      .update(setupState)
      .set({
        context: JSON.stringify(context),
        updatedAt: now,
      })
      .where(eq(setupState.id, 'setup'))
      .run();

    log.info({ provider }, 'AI provider configured');

    // Move to knowledge step instead of completing
    const finalState = await this.completeStep('ai_provider', 'knowledge');
    return { success: true, state: finalState };
  }

  /**
   * Complete knowledge gathering and move to admin creation
   */
  async completeKnowledge(): Promise<SetupStateRecord> {
    return this.completeStep('knowledge', 'create_admin');
  }

  /**
   * Create admin account and complete setup
   * @param email Admin email address
   * @param password Admin password
   * @param name Admin display name
   */
  async createAdminAccount(
    email: string,
    password: string,
    name: string
  ): Promise<{ success: boolean; error?: string; state: SetupStateRecord }> {
    const now = new Date().toISOString();

    // Check if email is already taken (by someone other than default admin)
    const existingUser = await db
      .select()
      .from(staff)
      .where(eq(staff.email, email))
      .get();

    if (existingUser && existingUser.id !== 'staff-admin-butler') {
      const state = await this.getState();
      return { success: false, error: 'Email address is already in use', state };
    }

    try {
      // Generate a unique ID for the new admin
      const adminId = `staff-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Create the new admin account
      // Note: Password is stored as-is for now (dev mode). In production, use bcrypt/argon2.
      await db
        .insert(staff)
        .values({
          id: adminId,
          email: email.toLowerCase().trim(),
          name: name.trim(),
          role: 'admin',
          department: 'management',
          permissions: JSON.stringify(['*']),
          status: 'active',
          passwordHash: password, // TODO: Hash in production
          createdAt: now,
          updatedAt: now,
        })
        .run();

      log.info({ adminId, email }, 'New admin account created');

      // Disable the default admin account
      await db
        .update(staff)
        .set({
          status: 'inactive',
          updatedAt: now,
        })
        .where(eq(staff.id, 'staff-admin-butler'))
        .run();

      log.info('Default admin account disabled');

      // Update context with admin info
      const state = await this.getState();
      const context: SetupContext = {
        ...state.context,
        adminCreated: true,
      };

      await db
        .update(setupState)
        .set({
          context: JSON.stringify(context),
          updatedAt: now,
        })
        .where(eq(setupState.id, 'setup'))
        .run();

      // Complete setup
      const finalState = await this.completeStep('create_admin', null);
      return { success: true, state: finalState };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create admin account';
      log.error({ error: message }, 'Failed to create admin account');
      const state = await this.getState();
      return { success: false, error: message, state };
    }
  }

  /**
   * Sync hotel profile from knowledge base entries
   * Extracts structured data (check-in/out times, contact info, address) from knowledge entries
   */
  async syncProfileFromKnowledge(): Promise<HotelProfile> {
    const profile = await this.getHotelProfile();

    // Get policy entries (check-in/out times)
    const policyEntries = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.category, 'policy'))
      .all();

    // Get contact entries
    const contactEntries = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.category, 'contact'))
      .all();

    // Get local_info entries (address/location)
    const locationEntries = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.category, 'local_info'))
      .all();

    // Extract check-in/out times from policy entries
    for (const entry of policyEntries) {
      const content = entry.content.toLowerCase();

      // Try to extract check-in time (e.g., "check-in: 3pm", "check in at 15:00")
      const checkInMatch = content.match(/check[- ]?in[:\s]+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      if (checkInMatch?.[1] && !profile.checkInTime) {
        profile.checkInTime = this.normalizeTime(checkInMatch[1]);
      }

      // Try to extract check-out time
      const checkOutMatch = content.match(/check[- ]?out[:\s]+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      if (checkOutMatch?.[1] && !profile.checkOutTime) {
        profile.checkOutTime = this.normalizeTime(checkOutMatch[1]);
      }
    }

    // Extract contact info
    for (const entry of contactEntries) {
      const content = entry.content;

      // Extract phone number
      const phoneMatch = content.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch && !profile.contactPhone) {
        profile.contactPhone = phoneMatch[0].trim();
      }

      // Extract email
      const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch && !profile.contactEmail) {
        profile.contactEmail = emailMatch[0].toLowerCase();
      }
    }

    // Extract address from location entries
    for (const entry of locationEntries) {
      if (!profile.address && entry.content.length > 10) {
        // Use the first substantial location entry as address
        profile.address = entry.content.substring(0, 500);
        break;
      }
    }

    // Save updated profile
    await this.saveHotelProfile(profile);

    log.info('Hotel profile synced from knowledge base');

    return profile;
  }

  /**
   * Normalize time string to HH:MM format
   */
  private normalizeTime(timeStr: string): string {
    const cleaned = timeStr.toLowerCase().trim();

    // Parse 12-hour format (e.g., "3pm", "3:00pm", "3:00 pm")
    const match12 = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (match12?.[1] && match12[3]) {
      let hours = parseInt(match12[1], 10);
      const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
      const period = match12[3].toLowerCase();

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Parse 24-hour format (e.g., "15:00", "15")
    const match24 = cleaned.match(/(\d{1,2})(?::(\d{2}))?/);
    if (match24?.[1]) {
      const hours = parseInt(match24[1], 10);
      const minutes = match24[2] ? parseInt(match24[2], 10) : 0;

      if (hours >= 0 && hours <= 23) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }

    // Fallback: return default if can't parse
    return '15:00';
  }

  /**
   * Validate API key and save AI provider config
   */
  private async validateAndSaveAIProvider(
    provider: AIProviderType,
    apiKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First, save the config
      const configKey = provider === 'anthropic' ? 'apiKey' : 'apiKey';
      await appConfigService.saveAppConfig(
        provider,
        { [configKey]: apiKey },
        true // enabled
      );

      // Test the connection
      const testResult = await appConfigService.testAppConnection(provider);

      if (!testResult.success) {
        // Disable the provider if test failed
        await appConfigService.setAppEnabled(provider, false);
        return { success: false, error: testResult.message };
      }

      // Keep Local AI enabled for embeddings (cloud providers don't support embeddings)
      // Local AI will be used for embeddings, cloud provider for chat completion

      log.info({ provider }, 'AI provider validated and enabled');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to configure AI provider';
      log.error({ provider, error: message }, 'Failed to configure AI provider');
      return { success: false, error: message };
    }
  }

  /**
   * Skip setup entirely and mark as completed
   */
  async skip(): Promise<SetupStateRecord> {
    const now = new Date().toISOString();

    // Check if state exists
    const existing = await this.getStateRecord();

    if (existing) {
      await db
        .update(setupState)
        .set({
          status: 'completed',
          currentStep: null,
          updatedAt: now,
        })
        .where(eq(setupState.id, 'setup'))
        .run();
    } else {
      await db
        .insert(setupState)
        .values({
          id: 'setup',
          status: 'completed',
          currentStep: null,
          completedSteps: '[]',
          context: '{}',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    log.info('Setup skipped');

    return this.getState();
  }

  /**
   * Reset setup state (for development)
   */
  async reset(): Promise<SetupStateRecord> {
    await db.delete(setupState).where(eq(setupState.id, 'setup')).run();

    log.info('Setup state reset');

    return this.createInitialState();
  }

  /**
   * Enable Local AI provider with embedding support
   */
  private async enableLocalAI(): Promise<void> {
    try {
      const localConfig = {
        embeddingModel: 'Xenova/all-MiniLM-L6-v2', // Default embedding model
      };

      // Save config for local AI provider with default embedding model
      // This is needed for getEmbeddingProvider() to recognize Local AI as an embedding provider
      await appConfigService.saveAppConfig(
        'local',
        localConfig,
        true // enabled
      );

      // Also activate the app in the registry so it's immediately available
      // (loadEnabledApps only runs at server startup)
      const registry = getAppRegistry();

      // Ensure the manifest is registered first
      const manifest = getManifest('local');
      if (manifest && !registry.get('local')) {
        registry.register(manifest);
      }

      await registry.activate('local', localConfig);

      log.info('Local AI provider enabled and activated with embedding support');
    } catch (error) {
      log.error({ error }, 'Failed to enable Local AI provider');
      // Don't fail setup if Local AI fails to enable
    }
  }

  /**
   * Get hotel profile from settings
   */
  private async getHotelProfile(): Promise<HotelProfile> {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, HOTEL_PROFILE_KEY))
      .get();

    if (!row) {
      return { ...DEFAULT_HOTEL_PROFILE };
    }

    try {
      return { ...DEFAULT_HOTEL_PROFILE, ...JSON.parse(row.value) };
    } catch {
      return { ...DEFAULT_HOTEL_PROFILE };
    }
  }

  /**
   * Save hotel profile to settings
   */
  private async saveHotelProfile(profile: HotelProfile): Promise<void> {
    const now = new Date().toISOString();

    const existing = await db
      .select()
      .from(settings)
      .where(eq(settings.key, HOTEL_PROFILE_KEY))
      .get();

    if (existing) {
      await db
        .update(settings)
        .set({ value: JSON.stringify(profile), updatedAt: now })
        .where(eq(settings.key, HOTEL_PROFILE_KEY))
        .run();
    } else {
      await db
        .insert(settings)
        .values({ key: HOTEL_PROFILE_KEY, value: JSON.stringify(profile), updatedAt: now })
        .run();
    }

    log.info({ profileName: profile.name }, 'Hotel profile saved');
  }

  /**
   * Get raw state record from database
   */
  private async getStateRecord(): Promise<typeof setupState.$inferSelect | undefined> {
    return db
      .select()
      .from(setupState)
      .where(eq(setupState.id, 'setup'))
      .get();
  }

  /**
   * Create initial state (not persisted)
   */
  private createInitialState(): SetupStateRecord {
    return {
      id: 'setup',
      status: 'pending',
      currentStep: null,
      completedSteps: [],
      context: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Convert database record to typed record
   */
  private dbToRecord(record: typeof setupState.$inferSelect): SetupStateRecord {
    let completedSteps: SetupStep[] = [];
    let context: SetupContext = {};

    try {
      completedSteps = JSON.parse(record.completedSteps);
    } catch {
      // Use empty array
    }

    try {
      context = JSON.parse(record.context);
    } catch {
      // Use empty object
    }

    return {
      id: record.id,
      status: record.status as SetupStatus,
      currentStep: record.currentStep as SetupStep | null,
      completedSteps,
      context,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
  }
}

/**
 * Default service instance
 */
export const setupService = new SetupService();
