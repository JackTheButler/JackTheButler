/**
 * Pre-arrival Automation Rule
 *
 * Sends a welcome message to guests 3 days before arrival.
 */

import type { AutomationRuleDefinition } from '../types.js';

/**
 * Pre-arrival welcome message rule
 *
 * Triggers: 3 days before arrival at 10:00 AM
 * Action: Sends welcome message via preferred channel
 */
export const preArrivalRule: AutomationRuleDefinition = {
  name: 'Pre-arrival Welcome',
  description: 'Sends a welcome message to guests 3 days before their arrival date',
  triggerType: 'time_based',
  triggerConfig: {
    type: 'before_arrival',
    offsetDays: -3, // 3 days before
    time: '10:00',
  },
  actionType: 'send_message',
  actionConfig: {
    template: 'pre_arrival_welcome',
    channel: 'preferred',
  },
  enabled: true,
};
