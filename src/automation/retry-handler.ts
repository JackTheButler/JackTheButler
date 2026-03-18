/**
 * Retry Handler
 *
 * Manages retry scheduling and processing for failed automation executions.
 * Implements exponential backoff with jitter to prevent thundering herd.
 */

import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { db, automationRules, automationExecutions } from '@/db/index.js';
import type { AutomationExecution } from '@/db/schema.js';
import { executeActionChain } from './chain-executor.js';
import { convertLegacyAction } from './chain-executor.js';
import type { RetryConfig, ActionDefinition, ExecutionContext } from './types.js';
import { DEFAULT_RETRY_CONFIG } from './types.js';
import { createLogger } from '@/utils/logger.js';
import { generateId } from '@/utils/id.js';
import { now } from '@/utils/time.js';

const log = createLogger('automation:retry');

/**
 * Calculate the next retry delay using exponential backoff with jitter
 */
export function calculateNextRetryDelay(
  attemptNumber: number,
  config: RetryConfig
): number {
  if (config.backoffType === 'fixed') {
    return config.initialDelayMs;
  }

  // Exponential backoff: delay = initialDelay * 2^(attempt-1)
  const exponentialDelay = config.initialDelayMs * Math.pow(2, attemptNumber - 1);

  // Add jitter (±10%) to prevent thundering herd
  const jitterRange = exponentialDelay * 0.1;
  const jitter = (Math.random() * 2 - 1) * jitterRange;

  const delayWithJitter = exponentialDelay + jitter;

  // Cap at max delay
  return Math.min(delayWithJitter, config.maxDelayMs);
}

/**
 * Schedule a retry for a failed execution
 */
export async function scheduleRetry(
  executionId: string,
  ruleId: string,
  attemptNumber: number,
  error: string
): Promise<void> {
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId))
    .limit(1);

  if (!rule) {
    log.warn({ executionId, ruleId }, 'Cannot schedule retry: rule not found');
    return;
  }

  // Parse retry config or use defaults
  const retryConfig: RetryConfig = rule.retryConfig
    ? JSON.parse(rule.retryConfig)
    : DEFAULT_RETRY_CONFIG;

  // Check if retries are enabled and we haven't exceeded max attempts
  if (!retryConfig.enabled || attemptNumber >= retryConfig.maxAttempts) {
    // Mark as permanently failed
    await db
      .update(automationExecutions)
      .set({
        status: 'failed',
        errorMessage: `Max retries (${retryConfig.maxAttempts}) exceeded. Last error: ${error}`,
        completedAt: now(),
      })
      .where(eq(automationExecutions.id, executionId));

    // Increment consecutive failures counter on the rule
    await db
      .update(automationRules)
      .set({
        consecutiveFailures: (rule.consecutiveFailures || 0) + 1,
        lastError: error,
        updatedAt: now(),
      })
      .where(eq(automationRules.id, ruleId));

    log.warn(
      { ruleId, executionId, attempts: attemptNumber },
      'Automation permanently failed after max retries'
    );

    return;
  }

  // Calculate next retry time
  const nextDelay = calculateNextRetryDelay(attemptNumber, retryConfig);
  const nextRetryAt = new Date(Date.now() + nextDelay);

  // Update execution with retry info
  await db
    .update(automationExecutions)
    .set({
      status: 'pending',
      attemptNumber: attemptNumber + 1,
      nextRetryAt: nextRetryAt.toISOString(),
      errorMessage: error,
    })
    .where(eq(automationExecutions.id, executionId));

  log.info(
    {
      ruleId,
      executionId,
      attemptNumber: attemptNumber + 1,
      nextRetryAt: nextRetryAt.toISOString(),
      delayMs: nextDelay,
    },
    'Scheduled automation retry'
  );
}

/**
 * Process pending retries - called by scheduler
 */
export async function processPendingRetries(): Promise<void> {

  // Find executions that are pending and due for retry
  const pendingRetries = await db
    .select()
    .from(automationExecutions)
    .where(
      and(
        eq(automationExecutions.status, 'pending'),
        isNotNull(automationExecutions.nextRetryAt),
        lte(automationExecutions.nextRetryAt, now())
      )
    )
    .limit(10); // Process in batches

  if (pendingRetries.length === 0) {
    return;
  }

  log.debug({ count: pendingRetries.length }, 'Processing pending retries');

  for (const execution of pendingRetries) {
    await retryExecution(execution);
  }
}

/**
 * Retry a single execution
 */
async function retryExecution(execution: AutomationExecution): Promise<void> {
  // Get the rule
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, execution.ruleId))
    .limit(1);

  if (!rule) {
    await db
      .update(automationExecutions)
      .set({
        status: 'failed',
        errorMessage: 'Rule not found',
        completedAt: now(),
      })
      .where(eq(automationExecutions.id, execution.id));
    return;
  }

  // Check if rule is still enabled
  if (!rule.enabled) {
    await db
      .update(automationExecutions)
      .set({
        status: 'failed',
        errorMessage: 'Rule disabled',
        completedAt: now(),
      })
      .where(eq(automationExecutions.id, execution.id));
    return;
  }

  log.info(
    { ruleId: rule.id, executionId: execution.id, attempt: execution.attemptNumber },
    'Retrying automation execution'
  );

  // Mark as running
  await db
    .update(automationExecutions)
    .set({
      status: 'running',
      nextRetryAt: null,
    })
    .where(eq(automationExecutions.id, execution.id));

  try {
    // Get actions (either from new actions field or convert legacy)
    const actions: ActionDefinition[] = rule.actions
      ? JSON.parse(rule.actions)
      : convertLegacyAction(rule.actionType as any, JSON.parse(rule.actionConfig));

    // Build execution context from trigger data
    const triggerData = execution.triggerData ? JSON.parse(execution.triggerData) : {};
    const context: ExecutionContext = {
      ruleId: rule.id,
      ruleName: rule.name,
      guest: triggerData.guest,
      reservation: triggerData.reservation,
      event: triggerData.event,
    };

    // Execute the action chain
    const { status, results, totalDurationMs } = await executeActionChain(actions, context);

    // Update execution with results
    await db
      .update(automationExecutions)
      .set({
        status,
        actionResults: JSON.stringify(results),
        completedAt: now(),
        executionTimeMs: totalDurationMs,
        errorMessage: null,
      })
      .where(eq(automationExecutions.id, execution.id));

    // Update rule stats
    if (status === 'completed') {
      // Reset consecutive failures on success
      await db
        .update(automationRules)
        .set({
          consecutiveFailures: 0,
          lastRunAt: now(),
          runCount: rule.runCount + 1,
          lastError: null,
          updatedAt: now(),
        })
        .where(eq(automationRules.id, rule.id));

      log.info(
        { ruleId: rule.id, executionId: execution.id, attempt: execution.attemptNumber },
        'Retry succeeded'
      );
    } else if (status === 'failed') {
      // Schedule another retry if possible
      const failedAction = results.find((r) => r.status === 'failed');
      await scheduleRetry(
        execution.id,
        rule.id,
        execution.attemptNumber || 1,
        failedAction?.error || 'Unknown error'
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error(
      { ruleId: rule.id, executionId: execution.id, error: errorMessage },
      'Retry execution failed with exception'
    );

    // Schedule another retry
    await scheduleRetry(
      execution.id,
      rule.id,
      execution.attemptNumber || 1,
      errorMessage
    );
  }
}

/**
 * Create a new execution record for tracking
 */
export async function createExecution(
  ruleId: string,
  triggerData?: Record<string, unknown>
): Promise<string> {
  const id = generateId('execution');

  await db.insert(automationExecutions).values({
    id,
    ruleId,
    triggeredAt: now(),
    status: 'running',
    triggerData: triggerData ? JSON.stringify(triggerData) : null,
    attemptNumber: 1,
    createdAt: now(),
  });

  return id;
}

/**
 * Update execution status after completion
 */
export async function updateExecutionStatus(
  executionId: string,
  status: 'completed' | 'failed' | 'partial',
  results?: unknown[],
  error?: string,
  durationMs?: number
): Promise<void> {
  await db
    .update(automationExecutions)
    .set({
      status,
      actionResults: results ? JSON.stringify(results) : null,
      errorMessage: error || null,
      completedAt: now(),
      executionTimeMs: durationMs || null,
    })
    .where(eq(automationExecutions.id, executionId));
}
