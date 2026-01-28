/**
 * Automation Actions
 *
 * Executes actions for automation rules.
 */

import type { AutomationRule } from '@/db/schema.js';
import type {
  ActionType,
  SendMessageActionConfig,
  CreateTaskActionConfig,
  NotifyStaffActionConfig,
  WebhookActionConfig,
  ExecutionContext,
  ExecutionResult,
} from './types.js';
import { createLogger } from '@/utils/logger.js';
import { generateId } from '@/utils/id.js';

const log = createLogger('automation:actions');

/**
 * Message templates for automation
 */
const messageTemplates: Record<string, string> = {
  pre_arrival_welcome: `Hello {{firstName}}!

We're looking forward to welcoming you to our hotel on {{arrivalDate}}.

Your reservation is confirmed and we're preparing for your arrival. If you have any special requests or questions, please don't hesitate to let us know.

See you soon!
- Jack The Butler`,

  checkout_reminder: `Good morning {{firstName}}!

This is a friendly reminder that checkout time is at 11:00 AM today.

If you need a late checkout, please let me know and I'll check availability for you.

We hope you enjoyed your stay!
- Jack The Butler`,

  post_stay_thank_you: `Dear {{firstName}},

Thank you for staying with us! We hope you had a wonderful experience.

We'd love to hear your feedback. If there's anything we could have done better, please let us know.

We look forward to welcoming you back soon!
- Jack The Butler`,
};

/**
 * Execute an action for a rule
 */
export async function executeAction(
  rule: AutomationRule,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const actionType = rule.actionType as ActionType;

  try {
    let result: unknown;

    switch (actionType) {
      case 'send_message':
        result = await executeSendMessage(rule, context);
        break;

      case 'create_task':
        result = await executeCreateTask(rule, context);
        break;

      case 'notify_staff':
        result = await executeNotifyStaff(rule, context);
        break;

      case 'webhook':
        result = await executeWebhook(rule, context);
        break;

      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }

    const executionTimeMs = Date.now() - startTime;

    log.info(
      {
        ruleId: rule.id,
        actionType,
        executionTimeMs,
      },
      'Action executed successfully'
    );

    return {
      success: true,
      ruleId: rule.id,
      actionType,
      result,
      executionTimeMs,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error(
      {
        err: error,
        ruleId: rule.id,
        actionType,
      },
      'Action execution failed'
    );

    return {
      success: false,
      ruleId: rule.id,
      actionType,
      error: errorMessage,
      executionTimeMs,
    };
  }
}

/**
 * Execute a send_message action
 */
async function executeSendMessage(
  rule: AutomationRule,
  context: ExecutionContext
): Promise<{ messageContent: string; channel: string }> {
  const config = JSON.parse(rule.actionConfig) as SendMessageActionConfig;

  // Get template
  const template = messageTemplates[config.template];
  if (!template) {
    throw new Error(`Unknown message template: ${config.template}`);
  }

  // Build variables for template
  const variables: Record<string, string> = {
    firstName: context.guest?.firstName || 'Guest',
    lastName: context.guest?.lastName || '',
    roomNumber: context.reservation?.roomNumber || '',
    arrivalDate: context.reservation?.arrivalDate || '',
    departureDate: context.reservation?.departureDate || '',
    ...config.variables,
  };

  // Replace variables in template
  let messageContent = template;
  for (const [key, value] of Object.entries(variables)) {
    messageContent = messageContent.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  // Determine channel
  let channel = config.channel;
  if (channel === 'preferred') {
    // Determine preferred channel based on guest's available contact info
    if (context.guest?.phone) {
      channel = 'sms';
    } else if (context.guest?.email) {
      channel = 'email';
    } else {
      channel = 'sms'; // Default
    }
  }

  log.info(
    {
      ruleId: rule.id,
      guestId: context.guest?.id,
      channel,
      template: config.template,
    },
    'Sending automated message'
  );

  // In a real implementation, this would use the channel adapters
  // For now, we just log and return the result
  // TODO: Integrate with channel adapters when they're ready for proactive messaging

  return {
    messageContent,
    channel,
  };
}

/**
 * Execute a create_task action
 */
async function executeCreateTask(
  rule: AutomationRule,
  context: ExecutionContext
): Promise<{ taskId: string }> {
  const config = JSON.parse(rule.actionConfig) as CreateTaskActionConfig;

  // Replace variables in description
  let description = config.description;
  if (context.guest) {
    description = description.replace(/{{firstName}}/g, context.guest.firstName);
    description = description.replace(/{{lastName}}/g, context.guest.lastName);
  }
  if (context.reservation) {
    description = description.replace(/{{roomNumber}}/g, context.reservation.roomNumber || '');
  }

  const taskId = generateId('task');

  log.info(
    {
      ruleId: rule.id,
      taskId,
      type: config.type,
      department: config.department,
    },
    'Creating automated task'
  );

  // In a real implementation, this would create a task in the database
  // TODO: Integrate with task service

  return { taskId };
}

/**
 * Execute a notify_staff action
 */
async function executeNotifyStaff(
  rule: AutomationRule,
  context: ExecutionContext
): Promise<{ notificationSent: boolean }> {
  const config = JSON.parse(rule.actionConfig) as NotifyStaffActionConfig;

  // Replace variables in message
  let message = config.message;
  if (context.guest) {
    message = message.replace(/{{firstName}}/g, context.guest.firstName);
    message = message.replace(/{{lastName}}/g, context.guest.lastName);
  }
  if (context.reservation) {
    message = message.replace(/{{roomNumber}}/g, context.reservation.roomNumber || '');
  }

  log.info(
    {
      ruleId: rule.id,
      role: config.role,
      staffId: config.staffId,
    },
    'Sending staff notification'
  );

  // In a real implementation, this would send a notification to staff
  // TODO: Integrate with notification system

  return { notificationSent: true };
}

/**
 * Execute a webhook action
 */
async function executeWebhook(
  rule: AutomationRule,
  context: ExecutionContext
): Promise<{ status: number; response?: unknown }> {
  const config = JSON.parse(rule.actionConfig) as WebhookActionConfig;

  // Build request body if template provided
  let body: string | undefined;
  if (config.bodyTemplate) {
    body = config.bodyTemplate;
    // Replace variables
    body = body.replace(/{{ruleId}}/g, context.ruleId);
    body = body.replace(/{{ruleName}}/g, context.ruleName);
    if (context.guest) {
      body = body.replace(/{{guestId}}/g, context.guest.id);
      body = body.replace(/{{firstName}}/g, context.guest.firstName);
      body = body.replace(/{{lastName}}/g, context.guest.lastName);
    }
    if (context.reservation) {
      body = body.replace(/{{reservationId}}/g, context.reservation.id);
    }
  }

  log.info(
    {
      ruleId: rule.id,
      url: config.url,
      method: config.method || 'POST',
    },
    'Executing webhook'
  );

  try {
    const fetchOptions: RequestInit = {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    };

    if (body) {
      fetchOptions.body = body;
    }

    const response = await fetch(config.url, fetchOptions);

    const status = response.status;
    let responseData: unknown;

    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text();
    }

    if (!response.ok) {
      throw new Error(`Webhook returned status ${status}`);
    }

    return { status, response: responseData };
  } catch (error) {
    throw new Error(
      `Webhook failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get available message templates
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(messageTemplates);
}
