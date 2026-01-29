/**
 * Task Router Tests
 *
 * Tests for automatic task creation from guest intents.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TaskRouter,
  getTaskRouter,
  resetTaskRouter,
  type GuestContext,
  type RoutingDecision,
} from '@/core/task-router.js';
import type { ClassificationResult } from '@/ai/intent/index.js';

describe('TaskRouter', () => {
  let router: TaskRouter;

  // Standard guest context for tests
  const guestContext: GuestContext = {
    guestId: 'guest_123',
    firstName: 'John',
    lastName: 'Doe',
    roomNumber: '412',
    isVIP: false,
    language: 'en',
  };

  // VIP guest context
  const vipContext: GuestContext = {
    ...guestContext,
    isVIP: true,
    loyaltyTier: 'platinum',
  };

  beforeEach(() => {
    resetTaskRouter();
    router = new TaskRouter();
  });

  afterEach(() => {
    resetTaskRouter();
  });

  describe('shouldCreateTask', () => {
    it('returns true for actionable intents with high confidence', () => {
      const classification: ClassificationResult = {
        intent: 'request.housekeeping.towels',
        confidence: 0.9,
        department: 'housekeeping',
        requiresAction: true,
      };

      expect(router.shouldCreateTask(classification)).toBe(true);
    });

    it('returns false for low confidence classifications', () => {
      const classification: ClassificationResult = {
        intent: 'request.housekeeping.towels',
        confidence: 0.5,
        department: 'housekeeping',
        requiresAction: true,
      };

      expect(router.shouldCreateTask(classification)).toBe(false);
    });

    it('returns false for non-actionable intents', () => {
      const classification: ClassificationResult = {
        intent: 'inquiry.checkout',
        confidence: 0.95,
        department: 'front_desk',
        requiresAction: false,
      };

      expect(router.shouldCreateTask(classification)).toBe(false);
    });

    it('returns false for greetings', () => {
      const classification: ClassificationResult = {
        intent: 'greeting',
        confidence: 0.99,
        department: null,
        requiresAction: false,
      };

      expect(router.shouldCreateTask(classification)).toBe(false);
    });
  });

  describe('route', () => {
    it('creates housekeeping task for towel request', () => {
      const classification: ClassificationResult = {
        intent: 'request.housekeeping.towels',
        confidence: 0.9,
        department: 'housekeeping',
        requiresAction: true,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.department).toBe('housekeeping');
      expect(result.taskType).toBe('housekeeping');
      expect(result.priority).toBe('standard');
    });

    it('creates maintenance task for repair request', () => {
      const classification: ClassificationResult = {
        intent: 'request.maintenance',
        confidence: 0.85,
        department: 'maintenance',
        requiresAction: true,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.department).toBe('maintenance');
      expect(result.taskType).toBe('maintenance');
      expect(result.priority).toBe('high');
    });

    it('creates concierge task for restaurant booking', () => {
      const classification: ClassificationResult = {
        intent: 'request.concierge',
        confidence: 0.88,
        department: 'concierge',
        requiresAction: true,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.department).toBe('concierge');
      expect(result.taskType).toBe('concierge');
    });

    it('creates room service task for food order', () => {
      const classification: ClassificationResult = {
        intent: 'request.room_service',
        confidence: 0.92,
        department: 'room_service',
        requiresAction: true,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.department).toBe('room_service');
      expect(result.taskType).toBe('room_service');
    });

    it('does not create task for info requests', () => {
      const classification: ClassificationResult = {
        intent: 'inquiry.checkout',
        confidence: 0.95,
        department: 'front_desk',
        requiresAction: false,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(false);
    });

    it('does not create task for unknown intents', () => {
      const classification: ClassificationResult = {
        intent: 'unknown',
        confidence: 0.3,
        department: null,
        requiresAction: false,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(false);
    });

    it('does not create task for intents without department', () => {
      const classification: ClassificationResult = {
        intent: 'inquiry.wifi',
        confidence: 0.9,
        department: null,
        requiresAction: false,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(false);
    });
  });

  describe('VIP priority elevation', () => {
    it('elevates priority from standard to high for VIP guests', () => {
      const classification: ClassificationResult = {
        intent: 'request.housekeeping.towels',
        confidence: 0.9,
        department: 'housekeeping',
        requiresAction: true,
      };

      const result = router.route(classification, vipContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.priority).toBe('high'); // Elevated from 'standard'
    });

    it('elevates priority from high to urgent for VIP guests', () => {
      const classification: ClassificationResult = {
        intent: 'request.maintenance',
        confidence: 0.85,
        department: 'maintenance',
        requiresAction: true,
      };

      const result = router.route(classification, vipContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.priority).toBe('urgent'); // Elevated from 'high'
    });

    it('keeps urgent priority as urgent for VIP guests', () => {
      const classification: ClassificationResult = {
        intent: 'emergency',
        confidence: 0.99,
        department: 'front_desk',
        requiresAction: true,
      };

      const result = router.route(classification, vipContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.priority).toBe('urgent'); // Already at max
    });

    it('does not elevate priority for non-VIP guests', () => {
      const classification: ClassificationResult = {
        intent: 'request.housekeeping.towels',
        confidence: 0.9,
        department: 'housekeeping',
        requiresAction: true,
      };

      const result = router.route(classification, guestContext);

      expect(result.priority).toBe('standard'); // Not elevated
    });
  });

  describe('process', () => {
    it('returns shouldCreateTask=false for non-actionable intents', () => {
      const classification: ClassificationResult = {
        intent: 'greeting',
        confidence: 0.99,
        department: null,
        requiresAction: false,
      };

      const result = router.process(classification, guestContext);

      expect(result.shouldCreateTask).toBe(false);
    });

    it('returns full routing decision for actionable intents', () => {
      const classification: ClassificationResult = {
        intent: 'request.housekeeping.amenities',
        confidence: 0.88,
        department: 'housekeeping',
        requiresAction: true,
      };

      const result = router.process(classification, guestContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.department).toBe('housekeeping');
      expect(result.taskType).toBe('housekeeping');
      expect(result.priority).toBe('standard');
      expect(result.description).toBeDefined();
    });
  });

  describe('getTaskRouter singleton', () => {
    it('returns the same instance on multiple calls', () => {
      const router1 = getTaskRouter();
      const router2 = getTaskRouter();

      expect(router1).toBe(router2);
    });

    it('returns a new instance after reset', () => {
      const router1 = getTaskRouter();
      resetTaskRouter();
      const router2 = getTaskRouter();

      expect(router1).not.toBe(router2);
    });
  });

  describe('complaint handling', () => {
    it('creates high priority task for complaints', () => {
      const classification: ClassificationResult = {
        intent: 'feedback.complaint',
        confidence: 0.85,
        department: 'front_desk',
        requiresAction: true,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.department).toBe('front_desk');
      expect(result.priority).toBe('high');
    });

    it('elevates complaint priority to urgent for VIP', () => {
      const classification: ClassificationResult = {
        intent: 'feedback.complaint',
        confidence: 0.85,
        department: 'front_desk',
        requiresAction: true,
      };

      const result = router.route(classification, vipContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.priority).toBe('urgent');
    });
  });

  describe('emergency handling', () => {
    it('creates urgent task for emergencies', () => {
      const classification: ClassificationResult = {
        intent: 'emergency',
        confidence: 0.99,
        department: 'front_desk',
        requiresAction: true,
      };

      const result = router.route(classification, guestContext);

      expect(result.shouldCreateTask).toBe(true);
      expect(result.department).toBe('front_desk');
      expect(result.priority).toBe('urgent');
    });
  });
});
