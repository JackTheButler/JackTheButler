/**
 * Action Chain Executor
 *
 * Executes multiple actions in sequence with support for:
 * - Ordered execution
 * - Continue on error
 * - Conditional execution based on previous results
 * - Variable substitution from previous action outputs
 */

import type {
  ActionDefinition,
  ActionResult,
  ChainExecutionResult,
  ChainExecutionContext,
  ExecutionContext,
  ActionType,
  ActionConfig,
} from './types.js';
import { createLogger } from '@/utils/logger.js';
import { now } from '@/utils/time.js';

const log = createLogger('automation:chain');

/**
 * Execute a chain of actions in order
 */
export async function executeActionChain(
  actions: ActionDefinition[],
  context: ExecutionContext
): Promise<ChainExecutionResult> {
  const startTime = Date.now();
  const results: ActionResult[] = [];

  // Sort actions by order
  const sortedActions = [...actions].sort((a, b) => a.order - b.order);

  // Create chain context with space for previous results
  const chainContext: ChainExecutionContext = {
    ...context,
    previousResults: {},
  };

  let hasFailure = false;
  let hasSuccess = false;

  for (const action of sortedActions) {
    // Check condition before executing
    if (!shouldExecuteAction(action, chainContext)) {
      const result: ActionResult = {
        actionId: action.id,
        status: 'skipped',
        executedAt: now(),
        durationMs: 0,
      };
      results.push(result);
      chainContext.previousResults[action.id] = result;

      log.debug(
        { ruleId: context.ruleId, actionId: action.id, condition: action.condition },
        'Action skipped due to condition'
      );
      continue;
    }

    const actionStartTime = Date.now();

    try {
      // Execute the action
      const output = await executeSingleAction(action.type, action.config, chainContext);

      const result: ActionResult = {
        actionId: action.id,
        status: 'success',
        output: output as Record<string, unknown>,
        executedAt: now(),
        durationMs: Date.now() - actionStartTime,
      };

      results.push(result);
      chainContext.previousResults[action.id] = result;
      hasSuccess = true;

      log.info(
        { ruleId: context.ruleId, actionId: action.id, actionType: action.type, durationMs: result.durationMs },
        'Action executed successfully'
      );
    } catch (error) {
      hasFailure = true;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: ActionResult = {
        actionId: action.id,
        status: 'failed',
        error: errorMessage,
        executedAt: now(),
        durationMs: Date.now() - actionStartTime,
      };

      results.push(result);
      chainContext.previousResults[action.id] = result;

      log.warn(
        { ruleId: context.ruleId, actionId: action.id, actionType: action.type, error: errorMessage },
        'Action failed'
      );

      // Stop chain if continueOnError is false (default)
      if (!action.continueOnError) {
        log.info(
          { ruleId: context.ruleId, actionId: action.id },
          'Stopping action chain due to failure (continueOnError=false)'
        );
        break;
      }
    }
  }

  // Determine overall status
  let status: 'completed' | 'failed' | 'partial';
  if (!hasFailure) {
    status = 'completed';
  } else if (!hasSuccess) {
    status = 'failed';
  } else {
    status = 'partial';
  }

  const totalDurationMs = Date.now() - startTime;

  log.info(
    {
      ruleId: context.ruleId,
      status,
      actionCount: sortedActions.length,
      successCount: results.filter((r) => r.status === 'success').length,
      failedCount: results.filter((r) => r.status === 'failed').length,
      skippedCount: results.filter((r) => r.status === 'skipped').length,
      totalDurationMs,
    },
    'Action chain execution completed'
  );

  return { status, results, totalDurationMs };
}

/**
 * Check if an action should be executed based on its condition
 */
function shouldExecuteAction(
  action: ActionDefinition,
  context: ChainExecutionContext
): boolean {
  // No condition means always execute
  if (!action.condition) {
    return true;
  }

  const previousResults = Object.values(context.previousResults);
  const lastResult = previousResults[previousResults.length - 1];

  switch (action.condition.type) {
    case 'always':
      return true;

    case 'previous_success':
      return lastResult?.status === 'success';

    case 'previous_failed':
      return lastResult?.status === 'failed';

    case 'expression':
      if (action.condition.expression) {
        return evaluateConditionExpression(action.condition.expression, context);
      }
      return true;

    default:
      return true;
  }
}

/**
 * Evaluate a condition expression
 *
 * Supports simple expressions like:
 * - "{{actions.send_welcome.output.messageId}} != null"
 * - "{{actions.create_task.status}} == 'success'"
 */
function evaluateConditionExpression(
  expression: string,
  context: ChainExecutionContext
): boolean {
  try {
    // Replace variables with actual values
    let resolved = expression;

    // Replace {{actions.ACTION_ID.output.FIELD}} patterns
    const actionOutputPattern = /\{\{actions\.(\w+)\.output\.(\w+)\}\}/g;
    resolved = resolved.replace(actionOutputPattern, (_, actionId, field) => {
      const result = context.previousResults[actionId];
      if (!result || !result.output) return 'null';
      const value = result.output[field];
      return value === undefined ? 'null' : JSON.stringify(value);
    });

    // Replace {{actions.ACTION_ID.status}} patterns
    const actionStatusPattern = /\{\{actions\.(\w+)\.status\}\}/g;
    resolved = resolved.replace(actionStatusPattern, (_, actionId) => {
      const result = context.previousResults[actionId];
      return result ? `'${result.status}'` : 'null';
    });

    // Simple evaluation (no eval for security)
    // Support: == , != , null checks
    if (resolved.includes('!= null')) {
      const value = resolved.replace('!= null', '').trim();
      return value !== 'null' && value !== 'undefined' && value !== '';
    }

    if (resolved.includes('== null')) {
      const value = resolved.replace('== null', '').trim();
      return value === 'null' || value === 'undefined' || value === '';
    }

    if (resolved.includes('==')) {
      const [left, right] = resolved.split('==').map((s) => s.trim());
      return left === right;
    }

    if (resolved.includes('!=')) {
      const [left, right] = resolved.split('!=').map((s) => s.trim());
      return left !== right;
    }

    // Default to true if we can't evaluate
    log.warn({ expression, resolved }, 'Could not evaluate condition expression, defaulting to true');
    return true;
  } catch (error) {
    log.error({ expression, error }, 'Error evaluating condition expression');
    return false;
  }
}

/**
 * Execute a single action (wrapper for actions.ts functions)
 */
async function executeSingleAction(
  actionType: ActionType,
  config: ActionConfig,
  context: ChainExecutionContext
): Promise<unknown> {
  // Dynamically import to avoid circular dependencies
  const { executeActionByType } = await import('./actions.js');

  // Replace variables in config with values from previous actions
  const resolvedConfig = replaceVariablesInConfig(config, context);

  return executeActionByType(actionType, resolvedConfig, context);
}

/**
 * Replace variables in action config with values from context
 *
 * Supports:
 * - {{firstName}}, {{lastName}}, etc. (guest context)
 * - {{roomNumber}}, {{arrivalDate}}, etc. (reservation context)
 * - {{actions.ACTION_ID.output.FIELD}} (previous action outputs)
 */
function replaceVariablesInConfig(
  config: ActionConfig,
  context: ChainExecutionContext
): ActionConfig {
  const configStr = JSON.stringify(config);

  let resolved = configStr;

  // Standard variables
  const variables: Record<string, string> = {
    firstName: context.guest?.firstName || 'Guest',
    lastName: context.guest?.lastName || '',
    roomNumber: context.reservation?.roomNumber || '',
    arrivalDate: context.reservation?.arrivalDate || '',
    departureDate: context.reservation?.departureDate || '',
    ruleId: context.ruleId,
    ruleName: context.ruleName,
  };

  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  // Previous action outputs: {{actions.ACTION_ID.output.FIELD}}
  const actionOutputPattern = /\{\{actions\.(\w+)\.output\.(\w+)\}\}/g;
  resolved = resolved.replace(actionOutputPattern, (_, actionId, field) => {
    const result = context.previousResults[actionId];
    if (!result || !result.output) return '';
    const value = result.output[field];
    return value !== undefined ? String(value) : '';
  });

  return JSON.parse(resolved) as ActionConfig;
}

/**
 * Convert legacy single action to action chain format
 */
export function convertLegacyAction(
  actionType: ActionType,
  actionConfig: ActionConfig
): ActionDefinition[] {
  return [
    {
      id: `action_${Date.now().toString(36)}`,
      type: actionType,
      config: actionConfig,
      order: 1,
    },
  ];
}
