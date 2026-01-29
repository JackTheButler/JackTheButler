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
import { createLogger } from '@/utils/logger.js';
import { events, EventTypes } from '@/events/index.js';
import type { InboundMessage, OutboundMessage } from '@/types/message.js';
import type { Responder } from '@/pipeline/responder.js';
import { defaultResponder } from '@/pipeline/responder.js';
import type { ClassificationResult } from '@/ai/intent/index.js';

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
        department: null, // Will be determined by TaskRouter
        requiresAction: true, // Assume true, TaskRouter will verify
      };

      // Build task router context from guest context
      const taskContext: TaskRouterContext = {
        guestId: guestContext?.guest?.id ?? 'unknown',
        firstName: guestContext?.guest?.firstName ?? 'Guest',
        lastName: guestContext?.guest?.lastName ?? '',
        isVIP: guestContext?.guest?.vipStatus === 'vip' || guestContext?.guest?.vipStatus === 'VIP',
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
        try {
          const taskInput: Parameters<typeof taskService.create>[0] = {
            conversationId: conversation.id,
            source: 'auto',
            type: (routingDecision.taskType ?? 'other') as TaskType,
            department: routingDecision.department,
            description: routingDecision.description ?? inbound.content,
            priority: routingDecision.priority,
          };
          if (guestContext?.reservation?.roomNumber) {
            taskInput.roomNumber = guestContext.reservation.roomNumber;
          }
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

      // Modify response to acknowledge escalation
      response.content = `I understand you'd like to speak with someone from our team. I'm connecting you with a staff member who can assist you further. ${escalationDecision.priority === 'urgent' ? 'Someone will be with you shortly.' : 'Please hold on while I find someone to help.'}\n\nIn the meantime, is there anything else I can help clarify?`;
      response.metadata = {
        ...response.metadata,
        escalated: true,
        escalationReasons: escalationDecision.reasons,
        escalationPriority: escalationDecision.priority,
      };
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
