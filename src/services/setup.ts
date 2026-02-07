/**
 * Setup Service
 *
 * Manages the setup wizard state for fresh installations.
 * Handles Local AI bootstrapping and property info collection.
 *
 * @module services/setup
 */

import { eq } from 'drizzle-orm';
import { db, setupState, settings } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';
import { appConfigService } from './app-config.js';

const log = createLogger('service:setup');

/**
 * Setup status values
 */
export type SetupStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Setup steps
 */
export type SetupStep = 'bootstrap' | 'welcome' | 'property_name' | 'property_type' | 'ai_provider';

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
   * Save property info (name and type) to settings and move to AI provider step
   */
  async savePropertyInfo(
    name: string,
    type: PropertyType
  ): Promise<SetupStateRecord> {
    const now = new Date().toISOString();

    // Save to settings table
    await this.saveSetting('property_name', name);
    await this.saveSetting('property_type', type);

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

    log.info({ name, type }, 'Property info saved');

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

    // Complete setup
    const finalState = await this.completeStep('ai_provider', null);
    return { success: true, state: finalState };
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

      // If cloud AI is configured, disable local AI
      await appConfigService.setAppEnabled('local', false);

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
   * Enable Local AI provider
   */
  private async enableLocalAI(): Promise<void> {
    try {
      // Save config for local AI provider
      await appConfigService.saveAppConfig(
        'local',
        {
          // Local AI doesn't need credentials
        },
        true // enabled
      );

      log.info('Local AI provider enabled');
    } catch (error) {
      log.error({ error }, 'Failed to enable Local AI provider');
      // Don't fail setup if Local AI fails to enable
    }
  }

  /**
   * Save a setting to the settings table
   */
  private async saveSetting(key: string, value: string): Promise<void> {
    const now = new Date().toISOString();

    const existing = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .get();

    if (existing) {
      await db
        .update(settings)
        .set({ value, updatedAt: now })
        .where(eq(settings.key, key))
        .run();
    } else {
      await db
        .insert(settings)
        .values({ key, value, updatedAt: now })
        .run();
    }
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
