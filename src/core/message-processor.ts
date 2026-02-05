/**
 * Message Processor
 *
 * Central pipeline for processing incoming messages:
 * 1. Identify guest (for phone-based channels)
 * 2. Find or create conversation
 * 3. Match to guest profile and reservation
 * 4. Save inbound message
 * 5. Generate response (with guest context for personalization)
 * 6. Save outbound message
 * 7. Return response for delivery
 *
 * Part of the kernel - this is the core message processing business logic.
 *
 * @module core/message-processor
 */

import { ConversationService, conversationService } from '@/services/conversation.js';
import { GuestService, guestService } from '@/services/guest.js';
import { taskService, type TaskType } from '@/services/task.js';
import { guestContextService, type GuestContext } from './guest-context.js';
import { getEscalationManager } from './escalation-engine.js';
import { getTaskRouter, type GuestContext as TaskRouterContext } from './task-router.js';
import { getAutonomyEngine, type GuestContext as AutonomyContext } from './autonomy.js';
import { getApprovalQueue } from './approval-queue.js';
import { createLogger } from '@/utils/logger.js';
import { events, EventTypes } from '@/events/index.js';
import type { InboundMessage, OutboundMessage } from '@/types/message.js';
import type { Responder } from '@/ai/index.js';
import { defaultResponder } from '@/ai/index.js';
import type { ClassificationResult } from '@/ai/intent/index.js';
import { getIntentDefinition } from '@/ai/intent/index.js';

const log = createLogger('core:processor');

/**
 * Message Processor
 *
 * Core business logic for processing incoming guest messages and generating responses.
 */
export class MessageProcessor {
  constructor(
    private conversationSvc: ConversationService = conversationService,
    private guestSvc: GuestService = guestService,
    private responder: Responder = defaultResponder
  ) {}

  /**
   * Process an incoming message and generate a response
   */
  async process(inbound: InboundMessage): Promise<OutboundMessage> {
    const startTime = Date.now();

    log.info(
      { messageId: inbound.id, channel: inbound.channel, channelId: inbound.channelId },
      'Processing inbound message'
    );

    // 1. Identify guest (for phone-based channels)
    let guestId: string | undefined;
    if (inbound.channel === 'whatsapp' || inbound.channel === 'sms') {
      try {
        const guest = await this.guestSvc.findOrCreateByPhone(inbound.channelId);
        guestId = guest.id;
        log.debug({ guestId, phone: inbound.channelId }, 'Guest identified by phone');
      } catch (error) {
        log.warn({ error, phone: inbound.channelId }, 'Failed to identify guest by phone');
      }
    }

    // 2. Find or create conversation (with guest link)
    const conversation = await this.conversationSvc.findOrCreate(
      inbound.channel,
      inbound.channelId,
      guestId
    );

    log.debug(
      { conversationId: conversation.id, guestId: conversation.guestId },
      'Conversation resolved'
    );

    // 3. Match to guest and reservation (for phone/email channels)
    let guestContext: GuestContext | undefined;
    if (inbound.channel === 'whatsapp' || inbound.channel === 'sms') {
      try {
        // Match and link conversation to guest/reservation
        await guestContextService.matchConversation(conversation.id, { phone: inbound.channelId });
        // Get full guest context for AI
        guestContext = await guestContextService.getContextByConversation(conversation.id);
        if (guestContext.guest) {
          log.debug(
            {
              conversationId: conversation.id,
              guestName: guestContext.guest.fullName,
              hasReservation: !!guestContext.reservation,
              roomNumber: guestContext.reservation?.roomNumber,
            },
            'Guest context loaded'
          );
        }
      } catch (error) {
        log.warn({ error, conversationId: conversation.id }, 'Failed to load guest context');
      }
    }

    // 4. Save inbound message
    const savedInbound = await this.conversationSvc.addMessage(conversation.id, {
      direction: 'inbound',
      senderType: 'guest',
      content: inbound.content,
      contentType: inbound.contentType,
    });

    // Emit message received event
    events.emit({
      type: EventTypes.MESSAGE_RECEIVED,
      conversationId: conversation.id,
      messageId: savedInbound.id,
      channel: inbound.channel,
      content: inbound.content,
      contentType: inbound.contentType,
      timestamp: new Date(),
    });

    // 5. Generate response (with guest context for personalization)
    const response = await this.responder.generate(conversation, inbound, guestContext);

    log.debug({ conversationId: conversation.id, intent: response.intent }, 'Response generated');

    // 5a. Check if task should be created (TaskRouter)
    if (response.intent && response.confidence && response.confidence >= 0.6) {
      const taskRouter = getTaskRouter();

      // Build classification result from response
      const classification: ClassificationResult = {
        intent: response.intent,
        confidence: response.confidence,
        department: getIntentDefinition(response.intent)?.department ?? null,
        requiresAction: getIntentDefinition(response.intent)?.requiresAction ?? false,
      };

      // Build task router context from guest context
      const taskContext: TaskRouterContext = {
        guestId: guestContext?.guest?.id ?? 'unknown',
        firstName: guestContext?.guest?.firstName ?? 'Guest',
        lastName: guestContext?.guest?.lastName ?? '',
      };
      // Add optional fields only if they have values
      if (guestContext?.reservation?.roomNumber) {
        taskContext.roomNumber = guestContext.reservation.roomNumber;
      }
      if (guestContext?.guest?.loyaltyTier) {
        taskContext.loyaltyTier = guestContext.guest.loyaltyTier;
      }
      if (guestContext?.guest?.language) {
        taskContext.language = guestContext.guest.language;
      }

      const routingDecision = taskRouter.process(classification, taskContext);

      if (routingDecision.shouldCreateTask && routingDecision.department) {
        // Build a contextual task description
        const guestName = guestContext?.guest
          ? `${guestContext.guest.firstName} ${guestContext.guest.lastName}`
          : 'Guest';
        const roomInfo = guestContext?.reservation?.roomNumber
          ? `Room ${guestContext.reservation.roomNumber}`
          : '';
        const channelInfo = inbound.channel ? `via ${inbound.channel}` : '';

        // Create a clear, actionable description — message first, guest context at end
        const contextParts = [guestName, roomInfo, channelInfo].filter(Boolean).join(', ');
        const taskDescription = `"${inbound.content}" — ${contextParts}`;

        const taskInput: Parameters<typeof taskService.create>[0] = {
          conversationId: conversation.id,
          messageId: savedInbound.id,
          source: 'auto',
          type: (routingDecision.taskType ?? 'other') as TaskType,
          department: routingDecision.department,
          description: taskDescription,
          priority: routingDecision.priority,
        };
        if (guestContext?.reservation?.roomNumber) {
          taskInput.roomNumber = guestContext.reservation.roomNumber;
        }

        // Check if task creation requires approval
        if (routingDecision.requiresApproval) {
          // Queue task for approval instead of creating directly
          const approvalQueue = getApprovalQueue();
          const actionType = routingDecision.taskType === 'housekeeping'
            ? 'createHousekeepingTask'
            : routingDecision.taskType === 'maintenance'
              ? 'createMaintenanceTask'
              : routingDecision.taskType === 'concierge'
                ? 'createConciergeTask'
                : routingDecision.taskType === 'room_service'
                  ? 'createRoomServiceTask'
                  : 'createConciergeTask';

          const approvalItem = await approvalQueue.queueForApproval({
            type: 'task',
            actionType,
            actionData: taskInput as unknown as Record<string, unknown>,
            conversationId: conversation.id,
            guestId: guestContext?.guest?.id ?? undefined,
          });

          log.info(
            {
              approvalId: approvalItem.id,
              conversationId: conversation.id,
              taskType: routingDecision.taskType,
              department: routingDecision.department,
            },
            'Task queued for approval'
          );

          // Add approval info to response metadata
          response.metadata = {
            ...response.metadata,
            taskPendingApproval: true,
            approvalId: approvalItem.id,
            taskDepartment: routingDecision.department,
            taskPriority: routingDecision.priority,
          };
        } else {
          // Create task directly
          try {
            const task = await taskService.create(taskInput);

            log.info(
              {
                taskId: task.id,
                conversationId: conversation.id,
                department: routingDecision.department,
                priority: routingDecision.priority,
              },
              'Auto-created task from guest request'
            );

            // Add task info to response metadata
            response.metadata = {
              ...response.metadata,
              taskCreated: true,
              taskId: task.id,
              taskDepartment: routingDecision.department,
              taskPriority: routingDecision.priority,
            };

            // Emit task created event
            events.emit({
              type: EventTypes.TASK_CREATED,
              taskId: task.id,
              conversationId: conversation.id,
              type_: routingDecision.taskType ?? 'other',
              department: routingDecision.department,
              priority: routingDecision.priority,
              timestamp: new Date(),
            });
          } catch (error) {
            log.error({ error, conversationId: conversation.id }, 'Failed to create task');
          }
        }
      }
    }

    // 5b. Check for escalation
    const escalationManager = getEscalationManager();
    const escalationDecision = await escalationManager.shouldEscalate(
      conversation.id,
      inbound.content,
      response.confidence ?? 0.5
    );

    if (escalationDecision.shouldEscalate) {
      log.info(
        {
          conversationId: conversation.id,
          reasons: escalationDecision.reasons,
          priority: escalationDecision.priority,
        },
        'Escalating conversation'
      );

      // Update conversation state to escalated
      await this.conversationSvc.update(conversation.id, { state: 'escalated' });

      // Emit escalation event
      events.emit({
        type: EventTypes.CONVERSATION_ESCALATED,
        conversationId: conversation.id,
        reasons: escalationDecision.reasons,
        priority: escalationDecision.priority,
        timestamp: new Date(),
      });

      // Append escalation notice to response, preserving the AI's answer
      const escalationNotice = escalationDecision.priority === 'urgent'
        ? "I'm also connecting you with a staff member who will be with you shortly."
        : "I'm also connecting you with a staff member who can assist you further.";
      response.content = `${response.content}\n\n${escalationNotice}`;
      response.metadata = {
        ...response.metadata,
        escalated: true,
        escalationReasons: escalationDecision.reasons,
        escalationPriority: escalationDecision.priority,
      };
    }

    // 5c. Check autonomy settings for response approval
    const autonomyEngine = getAutonomyEngine();
    await autonomyEngine.ensureLoaded();

    // Build autonomy context
    const autonomyContext: AutonomyContext = {
      guestId: guestContext?.guest?.id ?? undefined,
      loyaltyTier: guestContext?.guest?.loyaltyTier ?? undefined,
      roomNumber: guestContext?.reservation?.roomNumber ?? undefined,
    };

    // Check if we can auto-execute the response
    const canAutoExecute = autonomyEngine.canAutoExecute('respondToGuest', autonomyContext);

    // Also check confidence-based autonomy decision
    const confidenceDecision = autonomyEngine.shouldAutoExecuteByConfidence(
      response.confidence ?? 0.5
    );

    if (!canAutoExecute || confidenceDecision === 'approval_required') {
      // Queue response for staff approval
      const approvalQueue = getApprovalQueue();
      const approvalItem = await approvalQueue.queueForApproval({
        type: 'response',
        actionType: 'respondToGuest',
        actionData: {
          conversationId: conversation.id,
          content: response.content,
          intent: response.intent,
          confidence: response.confidence,
          metadata: response.metadata,
        },
        conversationId: conversation.id,
        guestId: guestContext?.guest?.id ?? undefined,
      });

      log.info(
        {
          conversationId: conversation.id,
          approvalId: approvalItem.id,
          reason: !canAutoExecute ? 'autonomy_level' : 'low_confidence',
        },
        'Response queued for approval'
      );

      // Return a contextual pending response to the guest
      const pendingContent = this.getPendingMessage(response.intent, guestContext?.guest?.firstName);
      const pendingResponse: OutboundMessage = {
        conversationId: conversation.id,
        content: pendingContent,
        contentType: 'text',
        metadata: {
          pendingApproval: true,
          approvalId: approvalItem.id,
          originalResponse: response.content,
        },
      };

      // Save the pending response message
      await this.conversationSvc.addMessage(conversation.id, {
        direction: 'outbound',
        senderType: 'ai',
        content: pendingResponse.content,
        contentType: 'text',
      });

      const duration = Date.now() - startTime;
      log.info(
        { conversationId: conversation.id, duration, pendingApproval: true },
        'Message processed (pending approval)'
      );

      return pendingResponse;
    }

    // 6. Save outbound message
    const savedOutbound = await this.conversationSvc.addMessage(conversation.id, {
      direction: 'outbound',
      senderType: 'ai',
      content: response.content,
      contentType: 'text',
      intent: response.intent,
      confidence: response.confidence,
      entities: response.entities,
    });

    // Emit message sent event
    events.emit({
      type: EventTypes.MESSAGE_SENT,
      conversationId: conversation.id,
      messageId: savedOutbound.id,
      content: response.content,
      senderType: 'ai',
      timestamp: new Date(),
    });

    const duration = Date.now() - startTime;
    log.info(
      { conversationId: conversation.id, duration, intent: response.intent },
      'Message processed'
    );

    // 7. Return response for delivery
    const result: OutboundMessage = {
      conversationId: conversation.id,
      content: response.content,
      contentType: 'text',
    };

    if (response.metadata) {
      result.metadata = response.metadata;
    }

    return result;
  }

  /**
   * Generate a contextual pending message based on intent
   */
  private getPendingMessage(intent?: string, firstName?: string): string {
    const name = firstName ?? 'there';
    const prefix = `Thanks ${name}`;

    if (!intent) {
      return `${prefix}, I'm looking into this for you. Someone from our team will get back to you shortly.`;
    }

    if (intent.startsWith('request.housekeeping') || intent === 'request.dnd' || intent === 'request.laundry') {
      return `${prefix}, I've noted your housekeeping request. Our team will arrange this and confirm shortly.`;
    }
    if (intent.startsWith('request.maintenance')) {
      return `${prefix}, I've flagged this with our maintenance team. Someone will look into it shortly.`;
    }
    if (intent.startsWith('request.room_service')) {
      return `${prefix}, I've passed your order along. Our room service team will confirm shortly.`;
    }
    if (intent.startsWith('request.transport')) {
      return `${prefix}, I'm arranging your transport. Someone will confirm the details shortly.`;
    }
    if (intent.startsWith('request.reservation') || intent.startsWith('request.checkin') || intent.startsWith('request.checkout')) {
      return `${prefix}, I've forwarded your request to our front desk. They'll get back to you shortly.`;
    }
    if (intent.startsWith('request.billing')) {
      return `${prefix}, I've sent your billing request to our front desk. They'll have that ready for you shortly.`;
    }
    if (intent.startsWith('request.room_change')) {
      return `${prefix}, I've noted your room change request. Our front desk will look into available options shortly.`;
    }
    if (intent.startsWith('request.security') || intent.startsWith('request.noise')) {
      return `${prefix}, I've alerted our team about this. Someone will assist you right away.`;
    }
    if (intent.startsWith('request.special_occasion')) {
      return `${prefix}, how lovely! I've passed this along to our team to arrange something special for you.`;
    }
    if (intent.startsWith('feedback.complaint')) {
      return `${prefix}, I'm sorry to hear that. I've flagged your concern and a manager will follow up with you shortly.`;
    }
    if (intent.startsWith('inquiry')) {
      return `${prefix}, great question! Let me check on that — someone from our team will get back to you shortly.`;
    }
    if (intent === 'emergency') {
      return `${prefix}, I've immediately alerted our team. Someone will be with you right away.`;
    }

    return `${prefix}, I'm looking into this for you. Someone from our team will get back to you shortly.`;
  }

  /**
   * Set a different responder (for testing or different AI providers)
   */
  setResponder(responder: Responder): void {
    this.responder = responder;
  }
}

/**
 * Default processor instance
 */
export const messageProcessor = new MessageProcessor();

/**
 * Get the message processor
 */
export function getProcessor(): MessageProcessor {
  return messageProcessor;
}
