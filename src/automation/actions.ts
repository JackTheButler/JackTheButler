/**
 * Automation Actions
 *
 * Executes actions for automation rules.
 */

import type { AutomationRule } from '@/db/schema.js';
import type {
  ActionType,
  ActionConfig,
  SendMessageActionConfig,
  CreateTaskActionConfig,
  NotifyStaffActionConfig,
  WebhookActionConfig,
  ExecutionContext,
  ExecutionResult,
} from './types.js';
import { createLogger } from '@/utils/logger.js';
import { taskService, type TaskType, type TaskPriority } from '@/services/task.js';
import { conversationService } from '@/services/conversation.js';
import { events, EventTypes } from '@/events/index.js';
import type { ChannelType } from '@/types/index.js';

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
): Promise<{ messageContent: string; channel: string; messageId: string; conversationId: string }> {
  const config = JSON.parse(rule.actionConfig) as SendMessageActionConfig;

  // Build variables for template replacement
  const variables: Record<string, string> = {
    firstName: context.guest?.firstName || 'Guest',
    lastName: context.guest?.lastName || '',
    roomNumber: context.reservation?.roomNumber || '',
    arrivalDate: context.reservation?.arrivalDate || '',
    departureDate: context.reservation?.departureDate || '',
    ...config.variables,
  };

  // Get message content from template or custom message
  let messageContent: string;
  if (config.template === 'custom' && config.message) {
    messageContent = config.message;
  } else {
    const template = messageTemplates[config.template];
    if (!template) {
      throw new Error(`Unknown message template: ${config.template}`);
    }
    messageContent = template;
  }

  // Replace variables in message content
  for (const [key, value] of Object.entries(variables)) {
    messageContent = messageContent.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  // Determine channel
  let channel = config.channel;
  if (channel === 'preferred') {
    // Determine preferred channel based on guest's available contact info
    if (context.guest?.phone) {
      channel = 'whatsapp'; // Prefer WhatsApp if phone available
    } else if (context.guest?.email) {
      channel = 'email';
    } else {
      channel = 'sms'; // Default fallback
    }
  }

  log.info(
    {
      ruleId: rule.id,
      guestId: context.guest?.id,
      channel,
      template: config.template,
      contentLength: messageContent.length,
    },
    'Executing send_message action'
  );

  // Determine channel ID (phone for WhatsApp/SMS, email for email)
  const channelId = channel === 'email' ? context.guest?.email : context.guest?.phone;

  if (!channelId) {
    log.warn(
      { ruleId: rule.id, channel, guestId: context.guest?.id },
      'No contact info for channel, message cannot be sent'
    );
    throw new Error(`No contact info available for channel: ${channel}`);
  }

  if (!context.guest) {
    throw new Error('Guest context required to send message');
  }

  // Find or create a conversation for this guest on this channel
  const conversation = await conversationService.findOrCreate(
    channel as ChannelType,
    channelId,
    context.guest.id
  );

  log.info(
    { ruleId: rule.id, conversationId: conversation.id, channel, guestId: context.guest.id },
    'Found/created conversation for automation message'
  );

  // Add the message to the conversation
  const message = await conversationService.addMessage(conversation.id, {
    direction: 'outbound',
    senderType: 'system',
    content: messageContent,
    contentType: 'text',
  });

  log.info(
    { ruleId: rule.id, messageId: message.id, conversationId: conversation.id },
    'Automation message saved to conversation'
  );

  // Send via channel adapter
  try {
    const { getAppRegistry } = await import('@/apps/index.js');
    const registry = getAppRegistry();
    const channelAdapter = registry.getChannelAdapter(channel);

    if (channelAdapter) {
      await channelAdapter.send({
        conversationId: conversation.id,
        content: messageContent,
        contentType: 'text',
      });

      log.info(
        { ruleId: rule.id, channel, messageId: message.id, conversationId: conversation.id },
        'Automation message sent via channel adapter'
      );
    } else {
      log.warn(
        { ruleId: rule.id, channel },
        'Channel adapter not available, message saved but not delivered'
      );
    }
  } catch (error) {
    log.error(
      { ruleId: rule.id, channel, error, conversationId: conversation.id },
      'Failed to send via channel adapter, message saved but delivery failed'
    );
    // Don't throw - message is saved, delivery can be retried
  }

  return {
    messageContent,
    channel,
    messageId: message.id,
    conversationId: conversation.id,
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
    description = description.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  log.info(
    {
      ruleId: rule.id,
      type: config.type,
      department: config.department,
      priority: config.priority,
    },
    'Executing create_task action'
  );

  // Validate task type
  const validTypes: TaskType[] = ['housekeeping', 'maintenance', 'concierge', 'room_service', 'other'];
  const taskType = validTypes.includes(config.type as TaskType) ? (config.type as TaskType) : 'other';

  // Validate priority
  const validPriorities: TaskPriority[] = ['urgent', 'high', 'standard', 'low'];
  const priority = validPriorities.includes(config.priority as TaskPriority)
    ? (config.priority as TaskPriority)
    : 'standard';

  // Create the task using the task service
  const task = await taskService.create({
    type: taskType,
    department: config.department,
    description,
    priority,
    roomNumber: context.reservation?.roomNumber,
    source: 'automation',
  });

  log.info(
    { ruleId: rule.id, taskId: task.id, type: taskType, department: config.department },
    'Task created successfully via automation'
  );

  return { taskId: task.id };
}

/**
 * Execute a notify_staff action
 */
async function executeNotifyStaff(
  rule: AutomationRule,
  context: ExecutionContext
): Promise<{ notificationSent: boolean; notificationId: string }> {
  const config = JSON.parse(rule.actionConfig) as NotifyStaffActionConfig;

  // Replace variables in message
  let message = config.message;
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
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  // Validate priority
  const validPriorities = ['low', 'standard', 'high', 'urgent'] as const;
  const priority = validPriorities.includes(config.priority as typeof validPriorities[number])
    ? (config.priority as typeof validPriorities[number])
    : 'standard';

  log.info(
    {
      ruleId: rule.id,
      role: config.role,
      staffId: config.staffId,
      priority,
    },
    'Executing notify_staff action'
  );

  // Generate notification ID for tracking
  const { generateId } = await import('@/utils/id.js');
  const notificationId = generateId('notification');

  // Build payload with optional properties only if they have values
  const payload: {
    message: string;
    priority: 'low' | 'standard' | 'high' | 'urgent';
    role?: string;
    staffId?: string;
    automationRuleId?: string;
  } = {
    message,
    priority,
  };

  if (config.role) {
    payload.role = config.role;
  }
  if (config.staffId) {
    payload.staffId = config.staffId;
  }
  if (context.ruleId) {
    payload.automationRuleId = context.ruleId;
  }

  // Emit notification event (WebSocket bridge will push to dashboard)
  events.emit({
    type: EventTypes.STAFF_NOTIFICATION,
    payload,
    timestamp: new Date(),
  });

  log.info(
    { ruleId: rule.id, notificationId, role: config.role },
    'Staff notification emitted'
  );

  return { notificationSent: true, notificationId };
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

/**
 * Execute an action by type (used by chain executor)
 */
export async function executeActionByType(
  actionType: ActionType,
  config: ActionConfig,
  context: ExecutionContext
): Promise<unknown> {
  switch (actionType) {
    case 'send_message':
      return executeSendMessageDirect(config as SendMessageActionConfig, context);
    case 'create_task':
      return executeCreateTaskDirect(config as CreateTaskActionConfig, context);
    case 'notify_staff':
      return executeNotifyStaffDirect(config as NotifyStaffActionConfig, context);
    case 'webhook':
      return executeWebhookDirect(config as WebhookActionConfig, context);
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

/**
 * Direct execution functions for chain executor
 */
async function executeSendMessageDirect(
  config: SendMessageActionConfig,
  context: ExecutionContext
): Promise<{ messageContent: string; channel: string; messageId: string; conversationId: string }> {
  // Build variables for template replacement
  const variables: Record<string, string> = {
    firstName: context.guest?.firstName || 'Guest',
    lastName: context.guest?.lastName || '',
    roomNumber: context.reservation?.roomNumber || '',
    arrivalDate: context.reservation?.arrivalDate || '',
    departureDate: context.reservation?.departureDate || '',
    ...config.variables,
  };

  // Get message content from template or custom message
  let messageContent: string;
  if (config.template === 'custom' && config.message) {
    messageContent = config.message;
  } else {
    const template = messageTemplates[config.template];
    if (!template) {
      throw new Error(`Unknown message template: ${config.template}`);
    }
    messageContent = template;
  }

  // Replace variables in message content
  for (const [key, value] of Object.entries(variables)) {
    messageContent = messageContent.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  // Determine channel
  let channel = config.channel;
  if (channel === 'preferred') {
    if (context.guest?.phone) {
      channel = 'whatsapp';
    } else if (context.guest?.email) {
      channel = 'email';
    } else {
      channel = 'sms';
    }
  }

  // Determine channel ID (phone for WhatsApp/SMS, email for email)
  const channelId = channel === 'email' ? context.guest?.email : context.guest?.phone;

  if (!channelId) {
    log.warn(
      { ruleId: context.ruleId, channel, guestId: context.guest?.id },
      'No contact info for channel, message cannot be sent'
    );
    throw new Error(`No contact info available for channel: ${channel}`);
  }

  if (!context.guest) {
    throw new Error('Guest context required to send message');
  }

  // Find or create a conversation for this guest on this channel
  const conversation = await conversationService.findOrCreate(
    channel as ChannelType,
    channelId,
    context.guest.id
  );

  log.info(
    { ruleId: context.ruleId, conversationId: conversation.id, channel, guestId: context.guest.id },
    'Found/created conversation for automation message'
  );

  // Add the message to the conversation
  const message = await conversationService.addMessage(conversation.id, {
    direction: 'outbound',
    senderType: 'system',
    content: messageContent,
    contentType: 'text',
  });

  log.info(
    { ruleId: context.ruleId, messageId: message.id, conversationId: conversation.id },
    'Automation message saved to conversation'
  );

  // Send via channel adapter
  try {
    const { getAppRegistry } = await import('@/apps/index.js');
    const registry = getAppRegistry();
    const channelAdapter = registry.getChannelAdapter(channel);

    if (channelAdapter) {
      await channelAdapter.send({
        conversationId: conversation.id,
        content: messageContent,
        contentType: 'text',
      });

      log.info(
        { ruleId: context.ruleId, channel, messageId: message.id, conversationId: conversation.id },
        'Automation message sent via channel adapter'
      );
    } else {
      log.warn(
        { ruleId: context.ruleId, channel },
        'Channel adapter not available, message saved but not delivered'
      );
    }
  } catch (error) {
    log.error(
      { ruleId: context.ruleId, channel, error, conversationId: conversation.id },
      'Failed to send via channel adapter, message saved but delivery failed'
    );
    // Don't throw - message is saved, delivery can be retried
  }

  return {
    messageContent,
    channel,
    messageId: message.id,
    conversationId: conversation.id,
  };
}

async function executeCreateTaskDirect(
  config: CreateTaskActionConfig,
  context: ExecutionContext
): Promise<{ taskId: string }> {
  // Replace variables in description
  let description = config.description;
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
    description = description.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  const validTypes: TaskType[] = ['housekeeping', 'maintenance', 'concierge', 'room_service', 'other'];
  const taskType = validTypes.includes(config.type as TaskType) ? (config.type as TaskType) : 'other';

  const validPriorities: TaskPriority[] = ['urgent', 'high', 'standard', 'low'];
  const priority = validPriorities.includes(config.priority as TaskPriority)
    ? (config.priority as TaskPriority)
    : 'standard';

  const task = await taskService.create({
    type: taskType,
    department: config.department,
    description,
    priority,
    roomNumber: context.reservation?.roomNumber,
    source: 'automation',
  });

  return { taskId: task.id };
}

async function executeNotifyStaffDirect(
  config: NotifyStaffActionConfig,
  context: ExecutionContext
): Promise<{ notificationSent: boolean; notificationId: string }> {
  // Replace variables in message
  let message = config.message;
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
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  const validPriorities = ['low', 'standard', 'high', 'urgent'] as const;
  const priority = validPriorities.includes(config.priority as typeof validPriorities[number])
    ? (config.priority as typeof validPriorities[number])
    : 'standard';

  const { generateId } = await import('@/utils/id.js');
  const notificationId = generateId('notification');

  // Build payload with optional properties only if they have values
  const payload: {
    message: string;
    priority: 'low' | 'standard' | 'high' | 'urgent';
    role?: string;
    staffId?: string;
    automationRuleId?: string;
  } = {
    message,
    priority,
  };

  if (config.role) {
    payload.role = config.role;
  }
  if (config.staffId) {
    payload.staffId = config.staffId;
  }
  if (context.ruleId) {
    payload.automationRuleId = context.ruleId;
  }

  events.emit({
    type: EventTypes.STAFF_NOTIFICATION,
    payload,
    timestamp: new Date(),
  });

  return { notificationSent: true, notificationId };
}

async function executeWebhookDirect(
  config: WebhookActionConfig,
  context: ExecutionContext
): Promise<{ status: number; response?: unknown }> {
  let body: string | undefined;
  if (config.bodyTemplate) {
    body = config.bodyTemplate;
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
}
