/**
 * Automation Types
 *
 * Type definitions for the automation rules engine.
 */

/**
 * Trigger types
 */
export type TriggerType = 'time_based' | 'event_based';

/**
 * Action types
 */
export type ActionType = 'send_message' | 'create_task' | 'notify_staff' | 'webhook';

/**
 * Event types for event-based triggers
 */
export type EventType =
  | 'reservation.created'
  | 'reservation.updated'
  | 'reservation.checked_in'
  | 'reservation.checked_out'
  | 'reservation.cancelled'
  | 'conversation.started'
  | 'conversation.escalated'
  | 'task.created'
  | 'task.completed';

/**
 * Time-based trigger configuration
 */
export interface TimeTriggerConfig {
  // Relative to reservation date
  type: 'before_arrival' | 'after_arrival' | 'before_departure' | 'after_departure' | 'scheduled';
  // For relative triggers: number of days offset (negative = before)
  offsetDays?: number;
  // Time of day to trigger (HH:mm format)
  time?: string;
  // For scheduled: cron expression
  cron?: string;
}

/**
 * Event-based trigger configuration
 */
export interface EventTriggerConfig {
  eventType: EventType;
  // Optional conditions as JSON
  conditions?: Record<string, unknown>;
}

/**
 * Send message action configuration
 */
export interface SendMessageActionConfig {
  // Template name to use ('custom' for custom message)
  template: string;
  // Custom message content (used when template='custom')
  message?: string;
  // Channel to send on: 'preferred' uses guest's preferred channel
  channel: 'preferred' | 'whatsapp' | 'sms' | 'email';
  // Template variables (optional)
  variables?: Record<string, string>;
}

/**
 * Create task action configuration
 */
export interface CreateTaskActionConfig {
  type: string;
  department: string;
  description: string;
  priority?: 'urgent' | 'high' | 'standard' | 'low';
}

/**
 * Notify staff action configuration
 */
export interface NotifyStaffActionConfig {
  // Notify by role or specific staff ID
  role?: string;
  staffId?: string;
  message: string;
  priority?: 'low' | 'standard' | 'high' | 'urgent';
}

/**
 * Webhook action configuration
 */
export interface WebhookActionConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  // Body template (variables will be replaced)
  bodyTemplate?: string;
}

/**
 * Union type for all trigger configs
 */
export type TriggerConfig = TimeTriggerConfig | EventTriggerConfig;

/**
 * Union type for all action configs
 */
export type ActionConfig =
  | SendMessageActionConfig
  | CreateTaskActionConfig
  | NotifyStaffActionConfig
  | WebhookActionConfig;

/**
 * Automation event that triggers rule evaluation
 */
export interface AutomationEvent {
  type: EventType;
  timestamp: Date;
  data: {
    guestId?: string;
    reservationId?: string;
    conversationId?: string;
    taskId?: string;
    [key: string]: unknown;
  };
}

/**
 * Rule definition for creating automation rules
 */
export interface AutomationRuleDefinition {
  name: string;
  description?: string;
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  actionType: ActionType;
  actionConfig: ActionConfig;
  enabled?: boolean;
}

/**
 * Rule execution context
 */
export interface ExecutionContext {
  ruleId: string;
  ruleName: string;
  event?: AutomationEvent;
  guest?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    language?: string;
  };
  reservation?: {
    id: string;
    roomNumber?: string;
    arrivalDate: string;
    departureDate: string;
  };
}

/**
 * Rule execution result
 */
export interface ExecutionResult {
  success: boolean;
  ruleId: string;
  actionType: ActionType;
  result?: unknown;
  error?: string;
  executionTimeMs: number;
}

// ===================
// Action Chaining (Phase 20)
// ===================

/**
 * Action definition for chained actions
 */
export interface ActionDefinition {
  // Unique ID for this action in the chain
  id: string;
  // Action type
  type: ActionType;
  // Action-specific configuration
  config: ActionConfig;
  // Execution order (1, 2, 3...)
  order: number;
  // If true, continue to next action even if this fails
  continueOnError?: boolean;
  // Optional condition to run this action
  condition?: ActionCondition;
}

/**
 * Condition for executing an action
 */
export interface ActionCondition {
  type: 'previous_success' | 'previous_failed' | 'always' | 'expression';
  // For complex conditions (e.g., "{{actions.send_welcome.output.messageId}} != null")
  expression?: string;
}

/**
 * Result of a single action execution
 */
export interface ActionResult {
  actionId: string;
  status: 'success' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  executedAt: string;
  durationMs: number;
}

/**
 * Result of executing an action chain
 */
export interface ChainExecutionResult {
  status: 'completed' | 'failed' | 'partial';
  results: ActionResult[];
  totalDurationMs: number;
}

// ===================
// Retry Logic (Phase 20)
// ===================

/**
 * Retry configuration for automation rules
 */
export interface RetryConfig {
  enabled: boolean;
  // Max retry attempts (default: 3)
  maxAttempts: number;
  // Backoff type
  backoffType: 'fixed' | 'exponential';
  // Initial delay in milliseconds (default: 60000 = 1 min)
  initialDelayMs: number;
  // Max delay cap in milliseconds (default: 3600000 = 1 hour)
  maxDelayMs: number;
  // Only retry on specific error types (optional)
  retryableErrors?: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  enabled: true,
  maxAttempts: 3,
  backoffType: 'exponential',
  initialDelayMs: 60000, // 1 minute
  maxDelayMs: 3600000, // 1 hour
};

/**
 * Extended execution context with previous action results
 */
export interface ChainExecutionContext extends ExecutionContext {
  previousResults: Record<string, ActionResult>;
}
