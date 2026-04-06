/**
 * Autonomy Engine Tests
 *
 * Tests for configurable autonomy levels and action control.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AutonomyEngine,
  getAutonomyEngine,
  resetAutonomyEngine,
  DEFAULT_AUTONOMY_SETTINGS,
  mapTaskTypeToActionType,
  getLevelDescription,
  type AutonomySettings,
  type GuestContext,
} from '@/core/approval/autonomy.js';

describe('AutonomyEngine', () => {
  let engine: AutonomyEngine;

  beforeEach(() => {
    resetAutonomyEngine();
    engine = new AutonomyEngine();
  });

  afterEach(() => {
    resetAutonomyEngine();
  });

  describe('default settings', () => {
    it('has L2 as default level', () => {
      const settings = engine.getSettings();
      expect(settings.defaultLevel).toBe('L2');
    });

    it('has all action types configured', () => {
      const settings = engine.getSettings();
      const expectedActions = [
        'respondToGuest',
        'createHousekeepingTask',
        'createMaintenanceTask',
        'createConciergeTask',
        'createRoomServiceTask',
        'issueRefund',
        'offerDiscount',
        'sendMarketingMessage',
      ] as const;

      for (const action of expectedActions) {
        expect(settings.actions[action]).toBeDefined();
        expect(settings.actions[action].level).toBeDefined();
      }
    });

    it('has housekeeping at L2 by default', () => {
      const settings = engine.getSettings();
      expect(settings.actions.createHousekeepingTask.level).toBe('L2');
    });

    it('has financial actions at L1', () => {
      const settings = engine.getSettings();

      expect(settings.actions.issueRefund.level).toBe('L1');
      expect(settings.actions.offerDiscount.level).toBe('L1');
    });

    it('has confidence thresholds configured', () => {
      const settings = engine.getSettings();

      expect(settings.confidenceThresholds.approval).toBe(0.7);
      expect(settings.confidenceThresholds.urgent).toBe(0.5);
    });
  });

  describe('canAutoExecute', () => {
    it('allows auto-execute at L2 for housekeeping tasks', () => {
      const context: GuestContext = { guestId: 'guest_123' };
      expect(engine.canAutoExecute('createHousekeepingTask', context)).toBe(true);
    });

    it('allows auto-execute at L2 for responses', () => {
      const context: GuestContext = {};
      expect(engine.canAutoExecute('respondToGuest', context)).toBe(true);
    });

    it('requires approval at L1 for all actions', () => {
      const context: GuestContext = {};

      // Refunds are at L1 by default
      expect(engine.canAutoExecute('issueRefund', context)).toBe(false);
      expect(engine.canAutoExecute('offerDiscount', context)).toBe(false);
      expect(engine.canAutoExecute('sendMarketingMessage', context)).toBe(false);
    });

    it('requires approval when action is set to L1', async () => {
      const settings = engine.getSettings();
      settings.actions.respondToGuest = { level: 'L1' };
      await engine.saveSettings(settings);

      const context: GuestContext = {};
      expect(engine.canAutoExecute('respondToGuest', context)).toBe(false);
    });
  });

  describe('confidence-based decisions', () => {
    it('returns auto for confidence at or above approval threshold', () => {
      expect(engine.shouldAutoExecuteByConfidence(0.95)).toBe('auto');
      expect(engine.shouldAutoExecuteByConfidence(0.70)).toBe('auto'); // At threshold
    });

    it('returns approval_required for confidence below approval threshold', () => {
      expect(engine.shouldAutoExecuteByConfidence(0.69)).toBe('approval_required');
      expect(engine.shouldAutoExecuteByConfidence(0.30)).toBe('approval_required');
    });

    it('respects custom thresholds', async () => {
      const customSettings: AutonomySettings = {
        ...DEFAULT_AUTONOMY_SETTINGS,
        confidenceThresholds: {
          approval: 0.80,
          urgent: 0.60,
        },
      };
      await engine.saveSettings(customSettings);

      expect(engine.shouldAutoExecuteByConfidence(0.85)).toBe('auto'); // Above threshold
      expect(engine.shouldAutoExecuteByConfidence(0.75)).toBe('approval_required'); // Below threshold
    });
  });

  describe('urgent threshold', () => {
    it('has default urgent threshold at 0.5', () => {
      const settings = engine.getSettings();
      expect(settings.confidenceThresholds.urgent).toBe(0.5);
    });

    it('can be customized via settings', async () => {
      const settings = engine.getSettings();
      settings.confidenceThresholds.urgent = 0.6;
      await engine.saveSettings(settings);

      const updatedSettings = engine.getSettings();
      expect(updatedSettings.confidenceThresholds.urgent).toBe(0.6);
    });

    it('is independent from approval threshold', async () => {
      const settings = engine.getSettings();
      settings.confidenceThresholds.approval = 0.9;
      settings.confidenceThresholds.urgent = 0.3;
      await engine.saveSettings(settings);

      const updatedSettings = engine.getSettings();
      expect(updatedSettings.confidenceThresholds.approval).toBe(0.9);
      expect(updatedSettings.confidenceThresholds.urgent).toBe(0.3);
    });
  });

  describe('financial action limits', () => {
    it('blocks financial actions above maxAutoAmount', () => {
      expect(engine.canAutoApproveAmount('issueRefund', 50)).toBe(false); // Default is 0
    });

    it('allows financial actions within maxAutoAmount', async () => {
      const settings = engine.getSettings();
      settings.actions.issueRefund.maxAutoAmount = 100;
      await engine.saveSettings(settings);

      expect(engine.canAutoApproveAmount('issueRefund', 50)).toBe(true);
      expect(engine.canAutoApproveAmount('issueRefund', 150)).toBe(false);
    });

    it('blocks discount above maxAutoPercent', () => {
      expect(engine.canAutoApprovePercent('offerDiscount', 10)).toBe(false); // Default is 0
    });

    it('allows discount within maxAutoPercent', async () => {
      const settings = engine.getSettings();
      settings.actions.offerDiscount.maxAutoPercent = 15;
      await engine.saveSettings(settings);

      expect(engine.canAutoApprovePercent('offerDiscount', 10)).toBe(true);
      expect(engine.canAutoApprovePercent('offerDiscount', 20)).toBe(false);
    });
  });

  describe('getAutonomyEngine singleton', () => {
    it('returns the same instance on multiple calls', () => {
      const engine1 = getAutonomyEngine();
      const engine2 = getAutonomyEngine();

      expect(engine1).toBe(engine2);
    });

    it('returns a new instance after reset', () => {
      const engine1 = getAutonomyEngine();
      resetAutonomyEngine();
      const engine2 = getAutonomyEngine();

      expect(engine1).not.toBe(engine2);
    });
  });

  describe('helper functions', () => {
    it('maps task types to action types correctly', () => {
      expect(mapTaskTypeToActionType('housekeeping')).toBe('createHousekeepingTask');
      expect(mapTaskTypeToActionType('maintenance')).toBe('createMaintenanceTask');
      expect(mapTaskTypeToActionType('concierge')).toBe('createConciergeTask');
      expect(mapTaskTypeToActionType('room_service')).toBe('createRoomServiceTask');
      expect(mapTaskTypeToActionType('unknown')).toBeNull();
    });

    it('returns correct level descriptions', () => {
      expect(getLevelDescription('L1')).toContain('Approval Required');
      expect(getLevelDescription('L2')).toContain('Auto-Execute');
    });
  });
});
