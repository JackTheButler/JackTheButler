/**
 * Autonomy Engine
 *
 * Configurable autonomy levels for hotel AI operations.
 * Controls how autonomous Jack is for different action types.
 *
 * Levels:
 * - L1 (Assisted): All actions require staff approval
 * - L2 (Supervised): Auto-execute, staff monitors
 * - L3 (Autonomous): Full end-to-end handling
 *
 * @module core/approval/autonomy
 */

import { createLogger } from '@/utils/logger.js';
import { settingsService } from '@/services/settings.js';

const log = createLogger('core:autonomy');

// ===================
// Types
// ===================

/**
 * Autonomy level configuration
 * - L1: All actions require staff approval
 * - L2: Auto-execute (staff can monitor via dashboard)
 */
export type AutonomyLevel = 'L1' | 'L2';

/**
 * Types of actions that can be controlled by autonomy settings
 */
export type ActionType =
  | 'respondToGuest'
  | 'createHousekeepingTask'
  | 'createMaintenanceTask'
  | 'createConciergeTask'
  | 'createRoomServiceTask'
  | 'issueRefund'
  | 'offerDiscount'
  | 'sendMarketingMessage';

/**
 * Configuration for a specific action type
 */
export interface ActionConfig {
  /** Autonomy level for this action */
  level: AutonomyLevel;
  /** Maximum auto-approve amount for financial actions (optional) */
  maxAutoAmount?: number;
  /** Maximum auto-approve percentage for discount actions (optional) */
  maxAutoPercent?: number;
}

/**
 * Confidence thresholds for autonomy decisions
 */
export interface ConfidenceThresholds {
  /** Confidence above this level allows auto-send; below requires staff approval */
  approval: number;
  /** Confidence below this level flags conversation as urgent */
  urgent: number;
}

/**
 * Complete autonomy settings
 */
export interface AutonomySettings {
  /** Default autonomy level for actions not explicitly configured */
  defaultLevel: AutonomyLevel;
  /** Per-action autonomy configuration */
  actions: Record<ActionType, ActionConfig>;
  /** Confidence thresholds for decision-making */
  confidenceThresholds: ConfidenceThresholds;
}

/**
 * Guest context for autonomy decisions
 */
export interface GuestContext {
  guestId?: string | undefined;
  loyaltyTier?: string | undefined;
  roomNumber?: string | undefined;
}

// ===================
// Default Settings
// ===================

/**
 * Default autonomy settings (L2 - Auto-execute mode)
 * Safe defaults that allow automation while maintaining oversight
 */
export const DEFAULT_AUTONOMY_SETTINGS: AutonomySettings = {
  defaultLevel: 'L2',
  actions: {
    respondToGuest: { level: 'L2' },
    createHousekeepingTask: { level: 'L2' },
    createMaintenanceTask: { level: 'L2' },
    createConciergeTask: { level: 'L2' },
    createRoomServiceTask: { level: 'L2' },
    issueRefund: { level: 'L1', maxAutoAmount: 0 },
    offerDiscount: { level: 'L1', maxAutoPercent: 0 },
    sendMarketingMessage: { level: 'L1' },
  },
  confidenceThresholds: {
    approval: 0.7,
    urgent: 0.5,
  },
};

const SETTINGS_KEY = 'autonomy';

// ===================
// Autonomy Engine
// ===================

/**
 * Autonomy Engine
 *
 * Core business logic for determining action autonomy levels.
 * Loads settings from database and provides methods to check
 * if actions can be auto-executed based on configuration.
 */
export class AutonomyEngine {
  private settings: AutonomySettings;
  private loaded: boolean = false;

  constructor() {
    // Start with defaults, will load from DB on first use
    this.settings = structuredClone(DEFAULT_AUTONOMY_SETTINGS);
    log.info('Autonomy engine initialized with defaults');
  }

  /**
   * Load settings from database
   */
  async loadSettings(): Promise<void> {
    try {
      const stored = await settingsService.get<AutonomySettings | null>(SETTINGS_KEY, null);
      if (stored) {
        this.settings = this.mergeWithDefaults(stored);
        log.info('Autonomy settings loaded from database');
      } else {
        log.info('No autonomy settings in database, using defaults');
      }
      this.loaded = true;
    } catch (error) {
      log.error({ error }, 'Failed to load autonomy settings, using defaults');
      this.loaded = true;
    }
  }

  /**
   * Save settings to database
   */
  async saveSettings(newSettings: AutonomySettings): Promise<void> {
    await settingsService.set(SETTINGS_KEY, newSettings);
    this.settings = structuredClone(newSettings);
    log.info('Autonomy settings saved to database');
  }

  /**
   * Get current settings
   */
  getSettings(): AutonomySettings {
    return structuredClone(this.settings);
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults(): Promise<void> {
    await this.saveSettings(structuredClone(DEFAULT_AUTONOMY_SETTINGS));
    log.info('Autonomy settings reset to defaults');
  }

  /**
   * Check if an action can be auto-executed
   */
  canAutoExecute(actionType: ActionType, context: GuestContext = {}): boolean {
    const effectiveLevel = this.getEffectiveLevel(actionType, context);

    // L1 (Assisted) - Always requires approval
    // L2 (Auto-execute) - Can auto-execute
    return effectiveLevel === 'L2';
  }

  /**
   * Get the effective autonomy level for an action considering context
   */
  getEffectiveLevel(actionType: ActionType, _context: GuestContext = {}): AutonomyLevel {
    const config = this.getActionConfig(actionType);
    return config.level;
  }

  /**
   * Get action configuration
   */
  getActionConfig(actionType: ActionType): ActionConfig {
    return (
      this.settings.actions[actionType] || {
        level: this.settings.defaultLevel,
      }
    );
  }

  /**
   * Determine action based on confidence score
   */
  shouldAutoExecuteByConfidence(confidence: number): 'auto' | 'approval_required' {
    const thresholds = this.settings.confidenceThresholds;

    if (confidence >= thresholds.approval) {
      return 'auto';
    }

    return 'approval_required';
  }

  /**
   * Check if a financial action amount is within auto-approve limits
   */
  canAutoApproveAmount(actionType: ActionType, amount: number): boolean {
    const config = this.getActionConfig(actionType);

    if (config.maxAutoAmount === undefined) {
      return false; // No limit set means no auto-approval
    }

    return amount <= config.maxAutoAmount;
  }

  /**
   * Check if a discount percentage is within auto-approve limits
   */
  canAutoApprovePercent(actionType: ActionType, percent: number): boolean {
    const config = this.getActionConfig(actionType);

    if (config.maxAutoPercent === undefined) {
      return false; // No limit set means no auto-approval
    }

    return percent <= config.maxAutoPercent;
  }

  /**
   * Ensure settings are loaded before use
   */
  async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.loadSettings();
    }
  }

  /**
   * Merge partial settings with defaults
   * Also handles backward compatibility for old settings with L3 or requiresReview
   */
  private mergeWithDefaults(partial: Partial<AutonomySettings>): AutonomySettings {
    // Migrate defaultLevel: L3 -> L2
    let defaultLevel = partial.defaultLevel ?? DEFAULT_AUTONOMY_SETTINGS.defaultLevel;
    if (defaultLevel === 'L3' as string) {
      defaultLevel = 'L2';
    }

    // Migrate actions: L3 -> L2, remove requiresReview
    const migratedActions: Record<ActionType, ActionConfig> = {
      ...DEFAULT_AUTONOMY_SETTINGS.actions,
    };

    if (partial.actions) {
      for (const [key, config] of Object.entries(partial.actions)) {
        const actionType = key as ActionType;
        let level = config.level;
        // Migrate L3 to L2
        if (level === 'L3' as string) {
          level = 'L2';
        }
        // If old config had requiresReview: true, treat as L1
        if ((config as { requiresReview?: boolean }).requiresReview === true && level === 'L2') {
          level = 'L1';
        }
        const actionConfig: ActionConfig = { level };
        if (config.maxAutoAmount !== undefined) {
          actionConfig.maxAutoAmount = config.maxAutoAmount;
        }
        if (config.maxAutoPercent !== undefined) {
          actionConfig.maxAutoPercent = config.maxAutoPercent;
        }
        migratedActions[actionType] = actionConfig;
      }
    }

    // Migrate old threshold names to new names
    const oldThresholds = partial.confidenceThresholds as {
      autoExecute?: number;
      suggestToStaff?: number;
      escalate?: number;
      approval?: number;
      urgent?: number;
    } | undefined;

    const migratedThresholds: ConfidenceThresholds = {
      // Use new names if present, fall back to old names, then defaults
      approval: oldThresholds?.approval ?? oldThresholds?.suggestToStaff ?? DEFAULT_AUTONOMY_SETTINGS.confidenceThresholds.approval,
      urgent: oldThresholds?.urgent ?? oldThresholds?.escalate ?? DEFAULT_AUTONOMY_SETTINGS.confidenceThresholds.urgent,
    };

    return {
      defaultLevel,
      actions: migratedActions,
      confidenceThresholds: migratedThresholds,
    };
  }
}

// ===================
// Singleton
// ===================

let cachedEngine: AutonomyEngine | null = null;

/**
 * Get the autonomy engine singleton
 */
export function getAutonomyEngine(): AutonomyEngine {
  if (!cachedEngine) {
    cachedEngine = new AutonomyEngine();
  }
  return cachedEngine;
}

/**
 * Reset cached engine (for testing)
 */
export function resetAutonomyEngine(): void {
  cachedEngine = null;
}

// ===================
// Helper Functions
// ===================

/**
 * Map task type to action type
 */
export function mapTaskTypeToActionType(
  taskType: string
): ActionType | null {
  const mapping: Record<string, ActionType> = {
    housekeeping: 'createHousekeepingTask',
    maintenance: 'createMaintenanceTask',
    concierge: 'createConciergeTask',
    room_service: 'createRoomServiceTask',
  };
  return mapping[taskType] ?? null;
}

/**
 * Get human-readable level description
 */
export function getLevelDescription(level: AutonomyLevel): string {
  switch (level) {
    case 'L1':
      return 'Approval Required - All actions require staff approval';
    case 'L2':
      return 'Auto-Execute - Actions run automatically';
  }
}
