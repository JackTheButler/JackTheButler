/**
 * Automation Triggers
 *
 * Evaluates trigger conditions for automation rules.
 */

import type { AutomationRule } from '@/db/schema.js';
import type {
  AutomationEvent,
  TimeTriggerConfig,
  EventTriggerConfig,
  TriggerType,
} from './types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('automation:triggers');

/**
 * Check if a rule's trigger matches an event
 */
export function matchesTrigger(
  rule: AutomationRule,
  event: AutomationEvent
): boolean {
  const triggerType = rule.triggerType as TriggerType;

  switch (triggerType) {
    case 'event_based':
      return matchesEventTrigger(rule, event);
    case 'time_based':
      // Time-based triggers are handled by the scheduler
      return false;
    default:
      log.warn({ triggerType, ruleId: rule.id }, 'Unknown trigger type');
      return false;
  }
}

/**
 * Check if an event-based trigger matches
 */
function matchesEventTrigger(
  rule: AutomationRule,
  event: AutomationEvent
): boolean {
  try {
    const config = JSON.parse(rule.triggerConfig) as EventTriggerConfig;

    // Check event type match
    if (config.eventType !== event.type) {
      return false;
    }

    // Check additional conditions if specified
    if (config.conditions) {
      return matchesConditions(config.conditions, event.data);
    }

    return true;
  } catch (error) {
    log.error({ err: error, ruleId: rule.id }, 'Failed to parse trigger config');
    return false;
  }
}

/**
 * Check if conditions match event data
 */
function matchesConditions(
  conditions: Record<string, unknown>,
  data: Record<string, unknown>
): boolean {
  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = data[key];

    // Simple equality check for now
    // Could be extended to support operators like $gt, $lt, $in, etc.
    if (actualValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * Get reservations that match a time-based trigger for the current time
 */
export interface TimeTriggeredReservation {
  reservationId: string;
  guestId: string;
}

/**
 * Calculate the target date for a time-based trigger relative to today
 *
 * Examples:
 * - before_arrival with offsetDays=3: Find arrivals 3 days from now (today + 3)
 * - after_arrival with offsetDays=1: Find arrivals that were 1 day ago (today - 1)
 * - before_departure with offsetDays=0: Find departures today (checkout day reminders)
 * - after_departure with offsetDays=1: Find departures that were 1 day ago (post-stay follow-up)
 */
export function getTargetDateForTrigger(config: TimeTriggerConfig): Date | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (config.type) {
    case 'before_arrival':
      // Looking for arrivals in the future
      // offsetDays=3 means arrivals that are 3 days from now
      if (config.offsetDays !== undefined) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + config.offsetDays);
        return targetDate;
      }
      break;

    case 'after_arrival':
      // Looking for arrivals in the past
      // offsetDays=1 means arrivals that were 1 day ago
      if (config.offsetDays !== undefined) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - config.offsetDays);
        return targetDate;
      }
      break;

    case 'before_departure':
      // Looking for departures in the future
      // offsetDays=0 means departures today (same-day checkout reminder)
      // offsetDays=1 means departures 1 day from now
      if (config.offsetDays !== undefined) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + config.offsetDays);
        return targetDate;
      }
      break;

    case 'after_departure':
      // Looking for departures in the past
      // offsetDays=1 means departures that were 1 day ago
      if (config.offsetDays !== undefined) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - config.offsetDays);
        return targetDate;
      }
      break;

    case 'scheduled':
      // For scheduled triggers, return today
      return today;
  }

  return null;
}

/**
 * Check if the current time matches the trigger time
 */
export function matchesTriggerTime(config: TimeTriggerConfig): boolean {
  if (!config.time) {
    return true; // No specific time required
  }

  const now = new Date();
  const parts = config.time.split(':').map(Number);
  const targetHour = parts[0] ?? 0;
  const targetMinute = parts[1] ?? 0;

  // Allow a 5-minute window around the target time
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const currentMinutes = currentHour * 60 + currentMinute;
  const targetMinutes = targetHour * 60 + targetMinute;

  const diff = Math.abs(currentMinutes - targetMinutes);
  return diff <= 5;
}
