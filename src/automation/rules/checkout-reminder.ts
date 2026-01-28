/**
 * Checkout Reminder Automation Rule
 *
 * Sends a reminder message on the day of departure.
 */

import type { AutomationRuleDefinition } from '../types.js';

/**
 * Checkout reminder rule
 *
 * Triggers: On departure day at 8:00 AM
 * Action: Sends checkout reminder via preferred channel
 */
export const checkoutReminderRule: AutomationRuleDefinition = {
  name: 'Checkout Reminder',
  description: 'Sends a checkout reminder to guests on the morning of their departure',
  triggerType: 'time_based',
  triggerConfig: {
    type: 'before_departure',
    offsetDays: 0, // Same day
    time: '08:00',
  },
  actionType: 'send_message',
  actionConfig: {
    template: 'checkout_reminder',
    channel: 'preferred',
  },
  enabled: true,
};
