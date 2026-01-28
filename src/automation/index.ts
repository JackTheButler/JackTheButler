/**
 * Automation Engine
 *
 * Evaluates and executes automation rules based on events and schedules.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import {
  automationRules,
  automationLogs,
  reservations,
  guests,
  type AutomationRule,
} from '@/db/schema.js';
import type {
  AutomationEvent,
  AutomationRuleDefinition,
  ExecutionContext,
  ExecutionResult,
  TimeTriggerConfig,
} from './types.js';
import { matchesTrigger, getTargetDateForTrigger, matchesTriggerTime } from './triggers.js';
import { executeAction } from './actions.js';
import { createLogger } from '@/utils/logger.js';
import { generateId } from '@/utils/id.js';

const log = createLogger('automation');

/**
 * Automation Engine
 *
 * Handles rule evaluation and execution for both
 * event-based and time-based automation.
 */
export class AutomationEngine {
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    log.info('Automation engine initialized');
  }

  /**
   * Evaluate an event against all enabled rules
   */
  async evaluate(event: AutomationEvent): Promise<ExecutionResult[]> {
    log.debug({ eventType: event.type }, 'Evaluating event');

    // Get all enabled rules
    const rules = await db
      .select()
      .from(automationRules)
      .where(eq(automationRules.enabled, true));

    const results: ExecutionResult[] = [];

    for (const rule of rules) {
      if (matchesTrigger(rule, event)) {
        log.info({ ruleId: rule.id, ruleName: rule.name }, 'Rule matched, executing action');

        // Build execution context
        const context = await this.buildContext(rule, event);

        // Execute action
        const result = await executeAction(rule, context);
        results.push(result);

        // Log execution
        await this.logExecution(rule, result, event);

        // Update rule stats
        await this.updateRuleStats(rule, result);
      }
    }

    return results;
  }

  /**
   * Run time-based triggers
   * Should be called periodically (e.g., every minute)
   */
  async runScheduledTriggers(): Promise<ExecutionResult[]> {
    log.debug('Running scheduled triggers');

    // Get all enabled time-based rules
    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(eq(automationRules.enabled, true), eq(automationRules.triggerType, 'time_based'))
      );

    const results: ExecutionResult[] = [];

    for (const rule of rules) {
      try {
        const config = JSON.parse(rule.triggerConfig) as TimeTriggerConfig;

        // Check if the time matches
        if (!matchesTriggerTime(config)) {
          continue;
        }

        // Get target date for this trigger
        const targetDate = getTargetDateForTrigger(config);
        if (!targetDate) {
          continue;
        }

        // Find matching reservations
        const targetDateStr = targetDate.toISOString().split('T')[0] || '';
        const matchingReservations = await this.findMatchingReservations(config, targetDateStr);

        for (const reservation of matchingReservations) {
          // Check if we already ran this rule for this reservation today
          const alreadyRan = await this.hasRunToday(rule.id, reservation.id);
          if (alreadyRan) {
            continue;
          }

          log.info(
            {
              ruleId: rule.id,
              ruleName: rule.name,
              reservationId: reservation.id,
            },
            'Time-based rule triggered'
          );

          // Build execution context
          const context = await this.buildContextForReservation(rule, reservation.id);

          // Execute action
          const result = await executeAction(rule, context);
          results.push(result);

          // Log execution with reservation context
          await this.logExecution(rule, result, undefined, reservation.id);

          // Update rule stats
          await this.updateRuleStats(rule, result);
        }
      } catch (error) {
        log.error({ err: error, ruleId: rule.id }, 'Failed to process time-based rule');
      }
    }

    return results;
  }

  /**
   * Start the scheduler for time-based triggers
   */
  startScheduler(intervalMs: number = 60000): void {
    if (this.schedulerInterval) {
      log.warn('Scheduler already running');
      return;
    }

    this.schedulerInterval = setInterval(async () => {
      try {
        await this.runScheduledTriggers();
      } catch (error) {
        log.error({ err: error }, 'Scheduler error');
      }
    }, intervalMs);

    log.info({ intervalMs }, 'Automation scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      log.info('Automation scheduler stopped');
    }
  }

  /**
   * Create a new automation rule
   */
  async createRule(definition: AutomationRuleDefinition): Promise<AutomationRule> {
    const id = generateId('rule');

    const rule = await db
      .insert(automationRules)
      .values({
        id,
        name: definition.name,
        description: definition.description,
        triggerType: definition.triggerType,
        triggerConfig: JSON.stringify(definition.triggerConfig),
        actionType: definition.actionType,
        actionConfig: JSON.stringify(definition.actionConfig),
        enabled: definition.enabled ?? true,
      })
      .returning()
      .get();

    log.info({ ruleId: id, name: definition.name }, 'Automation rule created');

    return rule;
  }

  /**
   * Get all automation rules
   */
  async getRules(): Promise<AutomationRule[]> {
    return db.select().from(automationRules);
  }

  /**
   * Get a rule by ID
   */
  async getRule(id: string): Promise<AutomationRule | null> {
    const rule = await db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    return rule || null;
  }

  /**
   * Update a rule
   */
  async updateRule(
    id: string,
    updates: Partial<AutomationRuleDefinition>
  ): Promise<AutomationRule | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.triggerType !== undefined) updateData.triggerType = updates.triggerType;
    if (updates.triggerConfig !== undefined)
      updateData.triggerConfig = JSON.stringify(updates.triggerConfig);
    if (updates.actionType !== undefined) updateData.actionType = updates.actionType;
    if (updates.actionConfig !== undefined)
      updateData.actionConfig = JSON.stringify(updates.actionConfig);
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

    const rule = await db
      .update(automationRules)
      .set(updateData)
      .where(eq(automationRules.id, id))
      .returning()
      .get();

    if (rule) {
      log.info({ ruleId: id }, 'Automation rule updated');
    }

    return rule || null;
  }

  /**
   * Delete a rule
   */
  async deleteRule(id: string): Promise<boolean> {
    const result = await db.delete(automationRules).where(eq(automationRules.id, id)).returning();

    if (result.length > 0) {
      log.info({ ruleId: id }, 'Automation rule deleted');
      return true;
    }

    return false;
  }

  /**
   * Toggle a rule's enabled status
   */
  async toggleRule(id: string, enabled: boolean): Promise<AutomationRule | null> {
    return this.updateRule(id, { enabled });
  }

  // Private helper methods

  private async buildContext(
    rule: AutomationRule,
    event: AutomationEvent
  ): Promise<ExecutionContext> {
    const context: ExecutionContext = {
      ruleId: rule.id,
      ruleName: rule.name,
      event,
    };

    // Load guest if available
    if (event.data.guestId) {
      const guest = await db
        .select()
        .from(guests)
        .where(eq(guests.id, event.data.guestId as string))
        .get();

      if (guest) {
        context.guest = {
          id: guest.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          ...(guest.email && { email: guest.email }),
          ...(guest.phone && { phone: guest.phone }),
          ...(guest.language && { language: guest.language }),
        };
      }
    }

    // Load reservation if available
    if (event.data.reservationId) {
      const reservation = await db
        .select()
        .from(reservations)
        .where(eq(reservations.id, event.data.reservationId as string))
        .get();

      if (reservation) {
        context.reservation = {
          id: reservation.id,
          arrivalDate: reservation.arrivalDate,
          departureDate: reservation.departureDate,
          ...(reservation.roomNumber && { roomNumber: reservation.roomNumber }),
        };
      }
    }

    return context;
  }

  private async buildContextForReservation(
    rule: AutomationRule,
    reservationId: string
  ): Promise<ExecutionContext> {
    const context: ExecutionContext = {
      ruleId: rule.id,
      ruleName: rule.name,
    };

    // Load reservation
    const reservation = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .get();

    if (reservation) {
      context.reservation = {
        id: reservation.id,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        ...(reservation.roomNumber && { roomNumber: reservation.roomNumber }),
      };

      // Load associated guest
      const guest = await db
        .select()
        .from(guests)
        .where(eq(guests.id, reservation.guestId))
        .get();

      if (guest) {
        context.guest = {
          id: guest.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          ...(guest.email && { email: guest.email }),
          ...(guest.phone && { phone: guest.phone }),
          ...(guest.language && { language: guest.language }),
        };
      }
    }

    return context;
  }

  private async findMatchingReservations(
    config: TimeTriggerConfig,
    targetDateStr: string
  ): Promise<{ id: string; guestId: string }[]> {
    switch (config.type) {
      case 'before_arrival':
      case 'after_arrival':
        return db
          .select({ id: reservations.id, guestId: reservations.guestId })
          .from(reservations)
          .where(
            and(
              eq(reservations.arrivalDate, targetDateStr),
              eq(reservations.status, 'confirmed')
            )
          );

      case 'before_departure':
      case 'after_departure':
        return db
          .select({ id: reservations.id, guestId: reservations.guestId })
          .from(reservations)
          .where(
            and(
              eq(reservations.departureDate, targetDateStr),
              eq(reservations.status, 'checked_in')
            )
          );

      default:
        return [];
    }
  }

  private async hasRunToday(ruleId: string, reservationId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];

    const existingLog = await db
      .select({ id: automationLogs.id })
      .from(automationLogs)
      .where(
        and(
          eq(automationLogs.ruleId, ruleId),
          sql`json_extract(${automationLogs.triggerData}, '$.reservationId') = ${reservationId}`,
          sql`date(${automationLogs.createdAt}) = ${today}`
        )
      )
      .get();

    return !!existingLog;
  }

  private async logExecution(
    rule: AutomationRule,
    result: ExecutionResult,
    event?: AutomationEvent,
    reservationId?: string
  ): Promise<void> {
    const id = generateId('alog');

    const triggerData: Record<string, unknown> = {};
    if (event) {
      triggerData.eventType = event.type;
      triggerData.eventData = event.data;
    }
    if (reservationId) {
      triggerData.reservationId = reservationId;
    }

    await db.insert(automationLogs).values({
      id,
      ruleId: rule.id,
      status: result.success ? 'success' : 'failed',
      triggerData: JSON.stringify(triggerData),
      actionResult: result.result ? JSON.stringify(result.result) : undefined,
      errorMessage: result.error,
      executionTimeMs: result.executionTimeMs,
    });
  }

  private async updateRuleStats(rule: AutomationRule, result: ExecutionResult): Promise<void> {
    const updates: Record<string, unknown> = {
      lastRunAt: new Date().toISOString(),
      runCount: (rule.runCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    };

    if (!result.success) {
      updates.lastError = result.error;
    }

    await db.update(automationRules).set(updates).where(eq(automationRules.id, rule.id));
  }
}

/**
 * Cached engine instance
 */
let cachedEngine: AutomationEngine | null = null;

/**
 * Get the automation engine
 */
export function getAutomationEngine(): AutomationEngine {
  if (!cachedEngine) {
    cachedEngine = new AutomationEngine();
  }
  return cachedEngine;
}

/**
 * Reset cached engine (for testing)
 */
export function resetAutomationEngine(): void {
  if (cachedEngine) {
    cachedEngine.stopScheduler();
    cachedEngine = null;
  }
}

// Re-export types
export * from './types.js';
export { matchesTrigger, getTargetDateForTrigger, matchesTriggerTime } from './triggers.js';
export { executeAction, getAvailableTemplates } from './actions.js';
