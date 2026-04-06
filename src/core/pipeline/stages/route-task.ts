import { taskService, type TaskType } from '@/services/task.js';
import { getTaskRouter, type GuestContext as TaskRouterContext } from '@/core/task-router.js';
import { getApprovalQueue } from '@/core/approval/queue.js';
import { getIntentDefinition, type ClassificationResult } from '@/core/ai/intent/index.js';
import { mapTaskTypeToActionType } from '@/core/approval/autonomy.js';
import { events, EventTypes } from '@/events/index.js';
import { createLogger } from '@/utils/logger.js';
import { mergeResponseMetadata } from '../context.js';
import type { MessageContext } from '../context.js';

const log = createLogger('core:pipeline');

export async function routeTask(ctx: MessageContext): Promise<void> {
  if (!ctx.aiResponse?.intent || !ctx.aiResponse.confidence || ctx.aiResponse.confidence < 0.6) return;
  if (!ctx.conversation) return;

  const taskRouter = getTaskRouter();

  const classification: ClassificationResult = {
    intent: ctx.aiResponse.intent,
    confidence: ctx.aiResponse.confidence,
    department: getIntentDefinition(ctx.aiResponse.intent)?.department ?? null,
    requiresAction: getIntentDefinition(ctx.aiResponse.intent)?.requiresAction ?? false,
  };

  const taskContext: TaskRouterContext = {
    guestId: ctx.guestContext?.guest?.id ?? 'unknown',
    firstName: ctx.guestContext?.guest?.firstName ?? 'Guest',
    lastName: ctx.guestContext?.guest?.lastName ?? '',
  };
  if (ctx.guestContext?.reservation?.roomNumber) taskContext.roomNumber = ctx.guestContext.reservation.roomNumber;
  if (ctx.guestContext?.guest?.loyaltyTier) taskContext.loyaltyTier = ctx.guestContext.guest.loyaltyTier;
  if (ctx.guestContext?.guest?.language) taskContext.language = ctx.guestContext.guest.language;

  const routingDecision = taskRouter.process(classification, taskContext);
  if (!routingDecision.shouldCreateTask || !routingDecision.department) return;

  const guestName = ctx.guestContext?.guest
    ? `${ctx.guestContext.guest.firstName} ${ctx.guestContext.guest.lastName}`
    : 'Guest';
  const roomInfo = ctx.guestContext?.reservation?.roomNumber
    ? `Room ${ctx.guestContext.reservation.roomNumber}`
    : '';
  const channelInfo = ctx.inbound.channel ? `via ${ctx.inbound.channel}` : '';
  const contextParts = [guestName, roomInfo, channelInfo].filter(Boolean).join(', ');
  const taskDescription = `"${ctx.translatedContent ?? ctx.inbound.content}" — ${contextParts}`;

  const taskInput: Parameters<typeof taskService.create>[0] = {
    conversationId: ctx.conversation.id,
    messageId: ctx.savedInboundId ?? '',
    source: 'auto',
    type: (routingDecision.taskType ?? 'other') as TaskType,
    department: routingDecision.department,
    description: taskDescription,
    priority: routingDecision.priority,
  };
  if (ctx.guestContext?.reservation?.roomNumber) taskInput.roomNumber = ctx.guestContext.reservation.roomNumber;

  if (routingDecision.requiresApproval) {
    const approvalQueue = getApprovalQueue();
    const actionType = mapTaskTypeToActionType(routingDecision.taskType ?? '') ?? 'createConciergeTask';

    const approvalItem = await approvalQueue.queueForApproval({
      type: 'task',
      actionType,
      actionData: taskInput as unknown as Record<string, unknown>,
      conversationId: ctx.conversation.id,
      guestId: ctx.guestContext?.guest?.id ?? undefined,
    });

    log.info(
      { approvalId: approvalItem.id, conversationId: ctx.conversation.id, taskType: routingDecision.taskType, department: routingDecision.department },
      'Task queued for approval'
    );

    mergeResponseMetadata(ctx, {
      taskPendingApproval: true,
      approvalId: approvalItem.id,
      taskDepartment: routingDecision.department,
      taskPriority: routingDecision.priority,
    });
  } else {
    try {
      const task = await taskService.create(taskInput);

      log.info(
        { taskId: task.id, conversationId: ctx.conversation.id, department: routingDecision.department, priority: routingDecision.priority },
        'Auto-created task from guest request'
      );

      ctx.taskCreated = true;
      mergeResponseMetadata(ctx, {
        taskCreated: true,
        taskId: task.id,
        taskDepartment: routingDecision.department,
        taskPriority: routingDecision.priority,
      });

      events.emit({
        type: EventTypes.TASK_CREATED,
        taskId: task.id,
        conversationId: ctx.conversation.id,
        type_: routingDecision.taskType ?? 'other',
        department: routingDecision.department,
        priority: routingDecision.priority,
        timestamp: new Date(),
      });
    } catch (err) {
      log.error({ err, conversationId: ctx.conversation.id }, 'Failed to create task');
    }
  }
}
