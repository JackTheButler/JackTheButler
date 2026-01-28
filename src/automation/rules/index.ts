/**
 * Pre-defined Automation Rules
 *
 * These rules can be seeded into the database during setup.
 */

import type { AutomationRuleDefinition } from '../types.js';
import { preArrivalRule } from './pre-arrival.js';
import { checkoutReminderRule } from './checkout-reminder.js';

/**
 * All pre-defined automation rules
 */
export const defaultRules: AutomationRuleDefinition[] = [
  preArrivalRule,
  checkoutReminderRule,
];

export { preArrivalRule, checkoutReminderRule };
