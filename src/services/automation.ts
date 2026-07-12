/**
 * Automation Service
 *
 * DB-querying and AI-assisted helpers for automation rules that don't
 * belong on the AutomationEngine (log queries, natural-language rule
 * generation). Kept out of src/core/automation because it needs to accept
 * an AI provider resolved by the caller — core must not import @/apps.
 */

import { eq, desc } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { automationLogs, type AutomationLog } from '@/db/schema.js';
import { createLogger } from '@/utils/logger.js';
import { generateId } from '@/utils/id.js';
import type { AIProvider } from '@jackthebutler/shared';

const log = createLogger('automation');

export interface ListLogsOptions {
  status?: string | undefined;
  limit: number;
}

/**
 * Outcome of generating a rule from a natural language prompt.
 */
export type GenerateRuleOutcome =
  | { ok: true; rule: Record<string, unknown> }
  | { ok: false; kind: 'parse_error'; raw: string }
  | { ok: false; kind: 'invalid_rule'; rule: unknown };

const GENERATE_RULE_SYSTEM_PROMPT = `You are an automation rule generator for a hotel management system called Jack The Butler.
Given a natural language description, generate a JSON automation rule.

Available trigger types:
- time_based: {type: 'before_arrival'|'after_arrival'|'before_departure'|'after_departure', offsetDays: number, time: 'HH:MM'}
  - before_arrival: offsetDays is how many days before arrival (e.g., 3 = 3 days before)
  - after_arrival: offsetDays is how many days after arrival (e.g., 1 = 1 day after check-in)
  - before_departure: offsetDays is how many days before departure (e.g., 0 = checkout day)
  - after_departure: offsetDays is how many days after departure (e.g., 1 = 1 day after checkout)
- event_based: {eventType: 'reservation.created'|'reservation.checked_in'|'reservation.checked_out'|'conversation.escalated'|'task.created'|'task.completed'}

Available action types (can chain multiple):
- send_message: {template: 'custom'|'pre_arrival_welcome'|'checkout_reminder'|'post_stay_thank_you', message?: string, channel: 'preferred'|'sms'|'email'|'whatsapp'}
  - Use template: 'custom' with message field for custom messages
- create_task: {type: 'housekeeping'|'maintenance'|'concierge'|'room_service'|'other', department: string, description: string, priority?: 'low'|'standard'|'high'|'urgent'}
- notify_staff: {role?: string, staffId?: string, message: string, priority?: 'low'|'standard'|'high'|'urgent'}
- webhook: {url: string, method: 'GET'|'POST', bodyTemplate?: string, headers?: object}

Action chaining: The "actions" array contains multiple actions with order (1,2,3...). Each action can have:
- id: unique identifier for the action
- type: action type
- config: action-specific config
- order: execution order
- continueOnError: boolean (optional, continue chain if this action fails)
- condition: {type: 'previous_success'|'previous_failed'|'always'} (optional, when to run)

Retry config (optional):
- retryConfig: {enabled: true, maxAttempts: 3, backoffType: 'exponential'|'fixed', initialDelayMs: 60000, maxDelayMs: 3600000}

Variables available in messages/descriptions: {{firstName}}, {{lastName}}, {{roomNumber}}, {{arrivalDate}}, {{departureDate}}
Chain variables: {{actions.ACTION_ID.output.FIELD}} to reference previous action outputs (e.g., {{actions.send_welcome.output.messageId}})

Output format:
{
  "name": "Rule name",
  "description": "Brief description",
  "triggerType": "time_based" or "event_based",
  "triggerConfig": { ... },
  "actions": [
    { "id": "action_1", "type": "send_message", "config": { ... }, "order": 1 },
    { "id": "action_2", "type": "create_task", "config": { ... }, "order": 2, "condition": { "type": "previous_success" } }
  ],
  "retryConfig": { "enabled": true, "maxAttempts": 3, "backoffType": "exponential", "initialDelayMs": 60000, "maxDelayMs": 3600000 }
}

For simple single-action rules, also include legacy fields for backwards compatibility:
  "actionType": "send_message",
  "actionConfig": { ... }

Return ONLY valid JSON, no explanation or markdown.`;

export class AutomationService {
  /**
   * List automation logs, optionally filtered by status.
   * Unrecognized status values are silently ignored (no filter applied).
   */
  async getLogs(options: ListLogsOptions): Promise<AutomationLog[]> {
    const limit = Math.min(options.limit, 100);

    if (options.status === 'success' || options.status === 'failed') {
      return db
        .select()
        .from(automationLogs)
        .where(eq(automationLogs.status, options.status))
        .orderBy(desc(automationLogs.createdAt))
        .limit(limit);
    }

    return db.select().from(automationLogs).orderBy(desc(automationLogs.createdAt)).limit(limit);
  }

  /**
   * List execution logs for a specific rule.
   */
  async getLogsForRule(ruleId: string, limit: number): Promise<AutomationLog[]> {
    return db
      .select()
      .from(automationLogs)
      .where(eq(automationLogs.ruleId, ruleId))
      .orderBy(desc(automationLogs.createdAt))
      .limit(Math.min(limit, 100));
  }

  /**
   * Generate an automation rule from a natural language description using
   * the caller-supplied AI provider.
   */
  async generateRuleFromPrompt(prompt: string, aiProvider: AIProvider): Promise<GenerateRuleOutcome> {
    const response = await aiProvider.complete({
      messages: [
        { role: 'system', content: GENERATE_RULE_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 1500,
      temperature: 0.3,
    });

    // Parse the AI response
    let generatedRule: Record<string, unknown>;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      let jsonStr = response.content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      generatedRule = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      log.error({ response: response.content, error: parseError }, 'Failed to parse AI-generated rule');
      return { ok: false, kind: 'parse_error', raw: response.content };
    }

    // Validate the generated rule has required fields
    if (!generatedRule.name || !generatedRule.triggerType || !generatedRule.triggerConfig) {
      return { ok: false, kind: 'invalid_rule', rule: generatedRule };
    }

    // Ensure actions array exists (convert legacy if needed)
    if (!generatedRule.actions && generatedRule.actionType && generatedRule.actionConfig) {
      generatedRule.actions = [
        {
          id: generateId('action'),
          type: generatedRule.actionType,
          config: generatedRule.actionConfig,
          order: 1,
        },
      ];
    }

    // Generate IDs for actions if missing
    if (generatedRule.actions) {
      for (const action of generatedRule.actions as Array<Record<string, unknown>>) {
        if (!action.id) {
          action.id = generateId('action');
        }
      }
    }

    log.info({ prompt, ruleName: generatedRule.name }, 'Generated automation rule from natural language');

    return { ok: true, rule: generatedRule };
  }
}

export const automationService = new AutomationService();
