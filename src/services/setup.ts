/**
 * Setup Service
 *
 * Manages the setup wizard state for fresh installations.
 * Handles Local AI bootstrapping and property info collection.
 *
 * @module services/setup
 */

import { eq } from 'drizzle-orm';
import { db, setupState, knowledgeBase, staff } from '@/db/index.js';
import { settingsService } from './settings.js';
import { createLogger } from '@/utils/logger.js';
import { appConfigService } from '@/apps/config.js';
import { getAppRegistry, getManifest } from '@/apps/index.js';
import { SYSTEM_ROLE_IDS } from '@/permissions/defaults.js';
import { authService } from '../auth/auth.js';
import { now } from '@/utils/time.js';

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
 * Step configuration for AI-assisted message processing during setup
 */
interface StepConfig {
  purpose: string;
  expectedAnswer: string;
  canSkip: boolean;
  skipNextStep?: string;
  validation?: (value: string) => { valid: boolean; normalized?: string; error?: string };
}

const stepConfigs: Record<string, StepConfig> = {
  ask_website: {
    purpose: 'Collect the property website URL to learn about the property',
    expectedAnswer: 'A website URL (e.g., grandhotel.com or https://grandhotel.com)',
    canSkip: true,
    skipNextStep: 'ask_manual_checkin',
    validation: (value: string) => {
      let url = value.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      try {
        new URL(url);
        return { valid: true, normalized: url };
      } catch {
        return { valid: false, error: 'Invalid URL format' };
      }
    },
  },
  ask_manual_checkin: {
    purpose: 'Collect check-in and check-out times for the property',
    expectedAnswer: 'Check-in and check-out times (e.g., "Check-in: 3pm, Check-out: 11am")',
    canSkip: false,
  },
  ask_manual_room: {
    purpose: 'Collect information about room types at the property',
    expectedAnswer: 'Room type description (name, features, price range)',
    canSkip: false,
  },
  ask_manual_contact: {
    purpose: 'Collect contact information for the property',
    expectedAnswer: 'Contact details (phone, email, or address)',
    canSkip: false,
  },
  ask_manual_location: {
    purpose: 'Collect the property location and address',
    expectedAnswer: 'Property address or location description',
    canSkip: false,
  },
};

/**
 * Build the AI prompt used to interpret a guest's/operator's reply during a setup step
 */
function buildProcessMessagePrompt(
  message: string,
  stepConfig: StepConfig,
  propertyName: string,
  propertyType: string,
  question: string
): string {
  return `You are Jack, an AI assistant helping set up a hospitality management system for "${propertyName}" (a ${propertyType}).

CURRENT STEP: ${stepConfig.purpose}
QUESTION ASKED: "${question}"
EXPECTED ANSWER: ${stepConfig.expectedAnswer}
CAN SKIP: ${stepConfig.canSkip ? 'Yes - user can skip this step' : 'No - this information is required'}

USER'S MESSAGE: "${message}"

Analyze the user's message and determine their intent:

1. **answer** - They provided the requested information (even if informal like "3pm to 11am" for check-in times)
2. **question** - They're asking for clarification or more information
3. **skip** - They want to skip this step or don't have the information${stepConfig.canSkip ? '' : ' (not allowed for this step)'}
4. **unclear** - The message is unclear or off-topic

Respond with a JSON object:
{
  "intent": "answer" | "question" | "skip" | "unclear",
  "response": "Your helpful response to the user",
  "extractedValue": "The value extracted from their answer (only for intent=answer)"
}

Guidelines:
- Be friendly and conversational, not robotic
- For "question" intent: Explain what you need and why, offer examples
- For "skip" intent${stepConfig.canSkip ? ': Confirm you\'ll proceed without this info' : ': Politely explain this info is needed and ask again'}
- For "unclear" intent: Ask a clarifying question to get back on track
- For "answer" intent: Extract the actual value they provided
- Keep responses concise (1-2 sentences max)

JSON only, no markdown:`;
}

/**
 * Input to SetupService.processMessage()
 */
export interface ProcessMessageInput {
  message: string;
  step: string;
  propertyName: string;
  propertyType: string;
  question: string;
}

/**
 * Result of SetupService.processMessage(), mapped directly to the HTTP response body
 */
export interface ProcessMessageResult {
  action: 'proceed' | 'retry' | 'show_message' | 'skip';
  message: string | null;
  data: { value: string } | null;
  stayOnStep?: boolean;
  nextStep?: string | null;
}

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

    await this.upsertState({
      status: 'in_progress',
      currentStep: 'bootstrap',
    });

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

    const newStatus: SetupStatus = nextStep ? 'in_progress' : 'completed';

    await this.upsertState({
      status: newStatus,
      currentStep: nextStep,
      completedSteps: JSON.stringify(completedSteps),
    });

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

    await this.upsertState({ context: JSON.stringify(context) });

    return this.completeStep('property_name', 'property_type');
  }

  /**
   * Save property info (name and type) to hotel_profile and move to AI provider step
   */
  async savePropertyInfo(
    name: string,
    type: PropertyType
  ): Promise<SetupStateRecord> {

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

    await this.upsertState({ context: JSON.stringify(context) });

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

    await this.upsertState({ context: JSON.stringify(context) });

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

      // Create the new admin account. Password hashing is async, so it must happen
      // before the (synchronous) better-sqlite3 transaction below.
      const passwordHash = await authService.hashPassword(password);

      // Takeover of the default admin's email must be atomic: if the new admin
      // is reusing 'staff-admin-butler''s email, that row's email has to be freed
      // up (renamed) BEFORE the new row is inserted, or the UNIQUE constraint on
      // staff.email rejects the insert. Both writes happen in one transaction so
      // a failure partway through cannot leave the account in a half-applied
      // state that would lock the operator out of login.
      db.transaction((tx) => {
        if (existingUser && existingUser.id === 'staff-admin-butler') {
          tx.update(staff)
            .set({
              email: `disabled-${existingUser.id}-${Date.now()}@invalid.local`,
              status: 'inactive',
              updatedAt: now(),
            })
            .where(eq(staff.id, 'staff-admin-butler'))
            .run();
        }

        tx.insert(staff)
          .values({
            id: adminId,
            email: email.toLowerCase().trim(),
            name: name.trim(),
            roleId: SYSTEM_ROLE_IDS.ADMIN,
            permissions: JSON.stringify(['*']),
            status: 'active',
            passwordHash,
            createdAt: now(),
            updatedAt: now(),
          })
          .run();

        // Always ensure the default admin ends up disabled — covers the common
        // case where it exists under a different email and wasn't touched above.
        // A no-op if the row doesn't exist or was already renamed/disabled.
        tx.update(staff)
          .set({
            status: 'inactive',
            updatedAt: now(),
          })
          .where(eq(staff.id, 'staff-admin-butler'))
          .run();
      });

      log.info({ adminId, email }, 'New admin account created, default admin disabled');

      // Update context with admin info
      const state = await this.getState();
      const context: SetupContext = {
        ...state.context,
        adminCreated: true,
      };

      await this.upsertState({ context: JSON.stringify(context) });

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
      log.debug({ content: entry.content }, 'Processing policy entry for time extraction');

      // Try to extract check-in time (e.g., "check-in: 3pm", "check in at 15:00", "check-in time is 2:00pm")
      const checkInMatch = content.match(/check[- ]?in(?:\s+time)?[:\s]+(?:is\s+)?(?:at\s+)?(?:from\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
      log.debug({ checkInMatch: checkInMatch?.[0], captured: checkInMatch?.[1] }, 'Check-in regex result');
      if (checkInMatch?.[1]) {
        const normalized = this.normalizeTime(checkInMatch[1]);
        log.debug({ input: checkInMatch[1], normalized }, 'Normalized check-in time');
        if (normalized) profile.checkInTime = normalized;
      }

      // Try to extract check-out time
      const checkOutMatch = content.match(/check[- ]?out(?:\s+time)?[:\s]+(?:is\s+)?(?:at\s+)?(?:by\s+)?(?:until\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
      log.debug({ checkOutMatch: checkOutMatch?.[0], captured: checkOutMatch?.[1] }, 'Check-out regex result');
      if (checkOutMatch?.[1]) {
        const normalized = this.normalizeTime(checkOutMatch[1]);
        log.debug({ input: checkOutMatch[1], normalized }, 'Normalized check-out time');
        if (normalized) profile.checkOutTime = normalized;
      }
    }

    log.info({ checkInTime: profile.checkInTime, checkOutTime: profile.checkOutTime }, 'Extracted times from policy entries');

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
   * Process a user message during a setup step with AI to determine intent and action.
   * Falls back to direct validation (or pass-through) when no AI provider is configured
   * or the AI call/response fails.
   */
  async processMessage(input: ProcessMessageInput): Promise<ProcessMessageResult> {
    const { message, step, propertyName, propertyType, question } = input;
    const stepConfig = stepConfigs[step];

    // If no step config, treat as direct answer (for steps without AI processing)
    if (!stepConfig) {
      return { action: 'proceed', message: null, data: { value: message } };
    }

    // Get AI provider
    const registry = getAppRegistry();
    const aiProvider = registry.getActiveAIProvider();

    if (!aiProvider) {
      log.warn('No AI provider available for message processing, falling back to direct processing');
      // Fallback: try validation if available, otherwise proceed
      if (stepConfig.validation) {
        const result = stepConfig.validation(message);
        if (result.valid) {
          return { action: 'proceed', message: null, data: { value: result.normalized || message } };
        } else {
          return { action: 'retry', message: result.error || 'Please try again with a valid value.', data: null };
        }
      }
      return { action: 'proceed', message: null, data: { value: message } };
    }

    try {
      const prompt = buildProcessMessagePrompt(message, stepConfig, propertyName, propertyType, question);

      const response = await aiProvider.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
        temperature: 0.3,
      });

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        log.warn('Failed to parse AI response, falling back');
        return { action: 'proceed', message: null, data: { value: message } };
      }

      const aiResult = JSON.parse(jsonMatch[0]) as {
        intent: 'answer' | 'question' | 'skip' | 'unclear';
        response: string;
        extractedValue?: string;
      };

      log.info({ step, intent: aiResult.intent }, 'Processed setup message');

      // Map AI intent to frontend action
      switch (aiResult.intent) {
        case 'answer': {
          const value = aiResult.extractedValue || message;

          // Run validation if available
          if (stepConfig.validation) {
            const validationResult = stepConfig.validation(value);
            if (!validationResult.valid) {
              return {
                action: 'retry',
                message: aiResult.response || validationResult.error || 'Please check your input and try again.',
                data: null,
              };
            }
            return {
              action: 'proceed',
              message: aiResult.response || null,
              data: { value: validationResult.normalized || value },
            };
          }

          return { action: 'proceed', message: aiResult.response || null, data: { value } };
        }

        case 'question':
          return { action: 'show_message', message: aiResult.response, data: null, stayOnStep: true };

        case 'skip':
          if (stepConfig.canSkip) {
            return {
              action: 'skip',
              message: aiResult.response,
              data: null,
              nextStep: stepConfig.skipNextStep || null,
            };
          } else {
            // Can't skip this step
            return { action: 'show_message', message: aiResult.response, data: null, stayOnStep: true };
          }

        case 'unclear':
        default:
          return { action: 'show_message', message: aiResult.response, data: null, stayOnStep: true };
      }
    } catch (error) {
      log.error({ error, step }, 'Failed to process message with AI');

      // Fallback: try direct validation or proceed
      if (stepConfig.validation) {
        const result = stepConfig.validation(message);
        if (result.valid) {
          return { action: 'proceed', message: null, data: { value: result.normalized || message } };
        }
      }

      return { action: 'retry', message: 'I had trouble understanding that. Could you try again?', data: null };
    }
  }

  /**
   * Normalize time string to HH:MM format (24-hour)
   * Returns null if cannot parse
   */
  private normalizeTime(timeStr: string): string | null {
    const cleaned = timeStr.toLowerCase().trim();

    // Parse 12-hour format (e.g., "3pm", "3:00pm", "3:00 pm")
    const match12 = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (match12?.[1] && match12[3]) {
      let hours = parseInt(match12[1], 10);
      const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
      const period = match12[3].toLowerCase();

      // Convert to 24-hour format
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

    // Return null if can't parse - don't guess
    return null;
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

    await this.upsertState({
      status: 'completed',
      currentStep: null,
    });

    log.info('Setup skipped');

    return this.getState();
  }

  /**
   * Reset setup state (for development)
   * Clears setup state, hotel profile, and knowledge base
   */
  async reset(): Promise<SetupStateRecord> {
    // Clear setup state
    await db.delete(setupState).where(eq(setupState.id, 'setup')).run();

    // Clear hotel profile from settings
    await settingsService.delete(HOTEL_PROFILE_KEY);

    // Clear knowledge base
    await db.delete(knowledgeBase).run();

    log.info('Setup state, settings, and knowledge base reset');

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
    const stored = await settingsService.get<Partial<HotelProfile> | null>(HOTEL_PROFILE_KEY, null);
    return { ...DEFAULT_HOTEL_PROFILE, ...(stored ?? {}) };
  }

  /**
   * Save hotel profile to settings
   */
  private async saveHotelProfile(profile: HotelProfile): Promise<void> {
    await settingsService.set(HOTEL_PROFILE_KEY, profile);
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
   * Insert-or-update the 'setup' state row.
   *
   * Every step method needs to persist a partial patch of state, but a plain
   * `db.update(...).where(id = 'setup')` silently no-ops if the row doesn't
   * exist yet (e.g. right after POST /reset deletes it). Upserting guarantees
   * the patch always lands, matching the insert-or-update behavior `start()`
   * already relied on.
   */
  private async upsertState(
    patch: Partial<
      Pick<typeof setupState.$inferInsert, 'status' | 'currentStep' | 'completedSteps' | 'context'>
    >
  ): Promise<void> {
    const updatedAt = now();

    await db
      .insert(setupState)
      .values({
        id: 'setup',
        ...patch,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: setupState.id,
        set: { ...patch, updatedAt },
      })
      .run();
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
