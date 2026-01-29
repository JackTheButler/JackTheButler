/**
 * Approval Queue
 *
 * Manages items pending staff approval when autonomy level requires it.
 * Used in L1 (Assisted) mode where all actions require approval,
 * and for specific actions that require review even at higher levels.
 *
 * @module core/approval-queue
 */

import { eq, and, desc, inArray, lte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { approvalQueue, guests, conversations, staff, messages, reservations } from '@/db/schema.js';
import type { ApprovalQueueItem } from '@/db/schema.js';
import type { ActionType } from './autonomy.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { NotFoundError } from '@/errors/index.js';
import { events, EventTypes } from '@/events/index.js';
import { taskService, type TaskType } from '@/services/task.js';
import { conversationService } from '@/services/conversation.js';

const log = createLogger('core:approval-queue');

// ===================
// Types
// ===================

/**
 * Type of approval item
 */
export type ApprovalItemType = 'response' | 'task' | 'offer';

/**
 * Status of an approval item
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/**
 * Input for creating an approval item
 */
export interface CreateApprovalInput {
  type: ApprovalItemType;
  actionType: ActionType;
  actionData: Record<string, unknown>;
  conversationId?: string | undefined;
  guestId?: string | undefined;
}

/**
 * Conversation message for context
 */
export interface ConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  senderType: string;
  content: string;
  createdAt: string;
}

/**
 * Approval item with related data
 */
export interface ApprovalItemDetails extends ApprovalQueueItem {
  guestName?: string | undefined;
  roomNumber?: string | undefined;
  conversationChannel?: string | undefined;
  staffName?: string | undefined;
  conversationMessages?: ConversationMessage[] | undefined;
}

/**
 * List options for approvals
 */
export interface ListApprovalsOptions {
  status?: ApprovalStatus | undefined;
  type?: ApprovalItemType | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Summary of pending approvals
 */
export interface ApprovalStats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
}

// ===================
// Approval Queue
// ===================

/**
 * Approval Queue
 *
 * Manages the queue of actions pending staff approval.
 */
export class ApprovalQueue {
  /**
   * Queue an action for approval
   */
  async queueForApproval(input: CreateApprovalInput): Promise<ApprovalQueueItem> {
    const id = generateId('approval');
    const now = new Date().toISOString();

    await db.insert(approvalQueue).values({
      id,
      type: input.type,
      actionType: input.actionType,
      actionData: JSON.stringify(input.actionData),
      conversationId: input.conversationId ?? null,
      guestId: input.guestId ?? null,
      status: 'pending',
      createdAt: now,
    });

    log.info(
      {
        approvalId: id,
        type: input.type,
        actionType: input.actionType,
        conversationId: input.conversationId,
      },
      'Action queued for approval'
    );

    // Emit event for real-time updates
    events.emit({
      type: EventTypes.APPROVAL_QUEUED,
      timestamp: new Date(),
      payload: {
        id,
        type: input.type,
        actionType: input.actionType,
        conversationId: input.conversationId ?? undefined,
        guestId: input.guestId ?? undefined,
      },
    });

    return this.getById(id);
  }

  /**
   * Get approval item by ID
   */
  async getById(id: string): Promise<ApprovalQueueItem> {
    const [item] = await db
      .select()
      .from(approvalQueue)
      .where(eq(approvalQueue.id, id))
      .limit(1);

    if (!item) {
      throw new NotFoundError('ApprovalItem', id);
    }

    return item;
  }

  /**
   * Get approval item with related details
   */
  async getDetails(id: string): Promise<ApprovalItemDetails> {
    const item = await this.getById(id);
    return this.enrichWithDetails(item);
  }

  /**
   * Approve an item
   */
  async approve(id: string, staffId: string): Promise<ApprovalQueueItem> {
    const item = await this.getById(id);

    if (item.status !== 'pending') {
      throw new Error(`Cannot approve item with status: ${item.status}`);
    }

    const now = new Date().toISOString();

    await db
      .update(approvalQueue)
      .set({
        status: 'approved',
        decidedAt: now,
        decidedBy: staffId,
      })
      .where(eq(approvalQueue.id, id));

    log.info({ approvalId: id, staffId }, 'Approval item approved');

    // Emit event
    events.emit({
      type: EventTypes.APPROVAL_DECIDED,
      timestamp: new Date(),
      payload: {
        id,
        status: 'approved',
        staffId,
      },
    });

    return this.getById(id);
  }

  /**
   * Reject an item
   */
  async reject(id: string, staffId: string, reason: string): Promise<ApprovalQueueItem> {
    const item = await this.getById(id);

    if (item.status !== 'pending') {
      throw new Error(`Cannot reject item with status: ${item.status}`);
    }

    const now = new Date().toISOString();

    await db
      .update(approvalQueue)
      .set({
        status: 'rejected',
        decidedAt: now,
        decidedBy: staffId,
        rejectionReason: reason,
      })
      .where(eq(approvalQueue.id, id));

    log.info({ approvalId: id, staffId, reason }, 'Approval item rejected');

    // Emit event
    events.emit({
      type: EventTypes.APPROVAL_DECIDED,
      timestamp: new Date(),
      payload: {
        id,
        status: 'rejected',
        staffId,
        reason,
      },
    });

    return this.getById(id);
  }

  /**
   * Get pending items
   */
  async getPending(limit: number = 50): Promise<ApprovalItemDetails[]> {
    const items = await db
      .select()
      .from(approvalQueue)
      .where(eq(approvalQueue.status, 'pending'))
      .orderBy(desc(approvalQueue.createdAt))
      .limit(limit);

    return this.enrichMultipleWithDetails(items);
  }

  /**
   * List items with filters
   */
  async list(options: ListApprovalsOptions = {}): Promise<ApprovalItemDetails[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const conditions = [];
    if (options.status) {
      conditions.push(eq(approvalQueue.status, options.status));
    }
    if (options.type) {
      conditions.push(eq(approvalQueue.type, options.type));
    }

    let query = db
      .select()
      .from(approvalQueue)
      .orderBy(desc(approvalQueue.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const items = await query;
    return this.enrichMultipleWithDetails(items);
  }

  /**
   * Get approval stats
   */
  async getStats(): Promise<ApprovalStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const pendingCount = await db
      .select()
      .from(approvalQueue)
      .where(eq(approvalQueue.status, 'pending'));

    const approvedToday = await db
      .select()
      .from(approvalQueue)
      .where(
        and(
          eq(approvalQueue.status, 'approved'),
          // Check if decidedAt is today
          // Note: Using raw SQL for date comparison would be more efficient
        )
      );

    const rejectedToday = await db
      .select()
      .from(approvalQueue)
      .where(
        and(
          eq(approvalQueue.status, 'rejected'),
        )
      );

    // Filter by date in JS (simpler for SQLite compatibility)
    return {
      pending: pendingCount.length,
      approvedToday: approvedToday.filter((i) => i.decidedAt && i.decidedAt >= todayStr).length,
      rejectedToday: rejectedToday.filter((i) => i.decidedAt && i.decidedAt >= todayStr).length,
    };
  }

  /**
   * Execute an approved action
   * This method should be called after approval to execute the pending action
   */
  async executeApprovedAction(item: ApprovalQueueItem): Promise<void> {
    if (item.status !== 'approved') {
      throw new Error(`Cannot execute action for item with status: ${item.status}`);
    }

    const actionData = JSON.parse(item.actionData) as Record<string, unknown>;

    log.info(
      {
        approvalId: item.id,
        actionType: item.actionType,
        itemType: item.type,
      },
      'Executing approved action'
    );

    // Execute based on item type
    switch (item.type) {
      case 'task': {
        // Create the task
        const task = await taskService.create({
          conversationId: actionData.conversationId as string | undefined,
          source: (actionData.source as 'manual' | 'auto' | 'automation') || 'auto',
          type: actionData.type as TaskType,
          department: actionData.department as string,
          description: actionData.description as string,
          priority: actionData.priority as 'urgent' | 'high' | 'standard' | 'low',
          roomNumber: actionData.roomNumber as string | undefined,
        });

        log.info(
          {
            approvalId: item.id,
            taskId: task.id,
            department: task.department,
          },
          'Task created from approval'
        );

        // Emit task created event
        const taskEvent: Parameters<typeof events.emit>[0] = {
          type: EventTypes.TASK_CREATED,
          taskId: task.id,
          type_: actionData.type as string,
          department: actionData.department as string,
          priority: actionData.priority as string,
          timestamp: new Date(),
        };
        if (actionData.conversationId) {
          (taskEvent as { conversationId?: string }).conversationId = actionData.conversationId as string;
        }
        events.emit(taskEvent);
        break;
      }

      case 'response': {
        // Send the response message
        const conversationId = actionData.conversationId as string;
        const content = actionData.content as string;

        await conversationService.addMessage(conversationId, {
          direction: 'outbound',
          senderType: 'ai',
          content,
          contentType: 'text',
          intent: actionData.intent as string | undefined,
          confidence: actionData.confidence as number | undefined,
        });

        log.info(
          {
            approvalId: item.id,
            conversationId,
          },
          'Response sent from approval'
        );

        // Emit message sent event
        events.emit({
          type: EventTypes.MESSAGE_SENT,
          conversationId,
          messageId: item.id, // Use approval ID as reference
          content,
          senderType: 'ai',
          timestamp: new Date(),
        });
        break;
      }

      case 'offer': {
        // TODO: Implement offer execution (refunds, discounts)
        log.warn({ approvalId: item.id }, 'Offer execution not yet implemented');
        break;
      }

      default:
        log.warn({ approvalId: item.id, type: item.type }, 'Unknown approval item type');
    }

    // Emit general execution event
    events.emit({
      type: EventTypes.APPROVAL_EXECUTED,
      timestamp: new Date(),
      payload: {
        id: item.id,
        actionType: item.actionType,
        actionData,
      },
    });
  }

  /**
   * Get parsed action data from an item
   */
  getActionData<T = Record<string, unknown>>(item: ApprovalQueueItem): T {
    return JSON.parse(item.actionData) as T;
  }

  /**
   * Enrich a single item with related details
   */
  private async enrichWithDetails(item: ApprovalQueueItem): Promise<ApprovalItemDetails> {
    const details: ApprovalItemDetails = { ...item };

    // Get guest info and room number
    let guestIdForReservation: string | null = item.guestId ?? null;
    if (item.guestId) {
      const [guest] = await db
        .select({ firstName: guests.firstName, lastName: guests.lastName })
        .from(guests)
        .where(eq(guests.id, item.guestId))
        .limit(1);

      if (guest) {
        details.guestName = `${guest.firstName} ${guest.lastName}`;
      }
    }

    // Get conversation info and messages
    if (item.conversationId) {
      const [conv] = await db
        .select({
          channelType: conversations.channelType,
          guestId: conversations.guestId,
        })
        .from(conversations)
        .where(eq(conversations.id, item.conversationId))
        .limit(1);

      if (conv) {
        details.conversationChannel = conv.channelType;

        // Get guest name from conversation if not already set
        if (!details.guestName && conv.guestId) {
          const [guest] = await db
            .select({ firstName: guests.firstName, lastName: guests.lastName })
            .from(guests)
            .where(eq(guests.id, conv.guestId))
            .limit(1);

          if (guest) {
            details.guestName = `${guest.firstName} ${guest.lastName}`;
          }
        }
      }

      // Get conversation messages (up to approval creation time, limit 10 most recent)
      const conversationMessages = await db
        .select({
          id: messages.id,
          direction: messages.direction,
          senderType: messages.senderType,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, item.conversationId),
            lte(messages.createdAt, item.createdAt)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(10);

      // Reverse to show oldest first
      details.conversationMessages = conversationMessages.reverse() as ConversationMessage[];

      // Update guestId if we got it from conversation
      if (!guestIdForReservation && conv?.guestId) {
        guestIdForReservation = conv.guestId;
      }
    }

    // Get room number from active reservation
    if (guestIdForReservation) {
      const [reservation] = await db
        .select({ roomNumber: reservations.roomNumber })
        .from(reservations)
        .where(
          and(
            eq(reservations.guestId, guestIdForReservation),
            eq(reservations.status, 'checked_in')
          )
        )
        .limit(1);

      if (reservation?.roomNumber) {
        details.roomNumber = reservation.roomNumber;
      }
    }

    // Get staff name if decided
    if (item.decidedBy) {
      const [staffMember] = await db
        .select({ name: staff.name })
        .from(staff)
        .where(eq(staff.id, item.decidedBy))
        .limit(1);

      if (staffMember) {
        details.staffName = staffMember.name;
      }
    }

    return details;
  }

  /**
   * Enrich multiple items with related details (batched for efficiency)
   */
  private async enrichMultipleWithDetails(
    items: ApprovalQueueItem[]
  ): Promise<ApprovalItemDetails[]> {
    if (items.length === 0) {
      return [];
    }

    // Collect unique IDs
    const guestIds = [...new Set(items.filter((i) => i.guestId).map((i) => i.guestId!))];
    const conversationIds = [
      ...new Set(items.filter((i) => i.conversationId).map((i) => i.conversationId!)),
    ];
    const staffIds = [...new Set(items.filter((i) => i.decidedBy).map((i) => i.decidedBy!))];

    // Batch fetch related data
    const guestMap = new Map<string, { firstName: string; lastName: string }>();
    if (guestIds.length > 0) {
      const guestList = await db
        .select({ id: guests.id, firstName: guests.firstName, lastName: guests.lastName })
        .from(guests)
        .where(inArray(guests.id, guestIds));

      for (const g of guestList) {
        guestMap.set(g.id, { firstName: g.firstName, lastName: g.lastName });
      }
    }

    const conversationMap = new Map<string, { channelType: string; guestId: string | null }>();
    const conversationMessagesMap = new Map<string, ConversationMessage[]>();
    if (conversationIds.length > 0) {
      const convList = await db
        .select({
          id: conversations.id,
          channelType: conversations.channelType,
          guestId: conversations.guestId,
        })
        .from(conversations)
        .where(inArray(conversations.id, conversationIds));

      for (const c of convList) {
        conversationMap.set(c.id, { channelType: c.channelType, guestId: c.guestId });
      }

      // Fetch messages for all conversations (we'll filter by createdAt per item later)
      const allMessages = await db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          direction: messages.direction,
          senderType: messages.senderType,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(inArray(messages.conversationId, conversationIds))
        .orderBy(desc(messages.createdAt));

      // Group messages by conversation
      for (const msg of allMessages) {
        if (!conversationMessagesMap.has(msg.conversationId)) {
          conversationMessagesMap.set(msg.conversationId, []);
        }
        conversationMessagesMap.get(msg.conversationId)!.push({
          id: msg.id,
          direction: msg.direction as 'inbound' | 'outbound',
          senderType: msg.senderType,
          content: msg.content,
          createdAt: msg.createdAt,
        });
      }
    }

    const staffMap = new Map<string, string>();
    if (staffIds.length > 0) {
      const staffList = await db
        .select({ id: staff.id, name: staff.name })
        .from(staff)
        .where(inArray(staff.id, staffIds));

      for (const s of staffList) {
        staffMap.set(s.id, s.name);
      }
    }

    // Get all guest IDs including from conversations
    const allGuestIds = new Set(guestIds);
    for (const conv of conversationMap.values()) {
      if (conv.guestId) {
        allGuestIds.add(conv.guestId);
      }
    }

    // Fetch room numbers for all guests with checked_in reservations
    const roomNumberMap = new Map<string, string>();
    if (allGuestIds.size > 0) {
      const reservationList = await db
        .select({ guestId: reservations.guestId, roomNumber: reservations.roomNumber })
        .from(reservations)
        .where(
          and(
            inArray(reservations.guestId, [...allGuestIds]),
            eq(reservations.status, 'checked_in')
          )
        );

      for (const r of reservationList) {
        if (r.roomNumber) {
          roomNumberMap.set(r.guestId, r.roomNumber);
        }
      }
    }

    // Enrich items
    return items.map((item) => {
      const details: ApprovalItemDetails = { ...item };

      // Get guest name
      if (item.guestId && guestMap.has(item.guestId)) {
        const guest = guestMap.get(item.guestId)!;
        details.guestName = `${guest.firstName} ${guest.lastName}`;
      }

      // Get conversation channel and guest from conversation
      if (item.conversationId && conversationMap.has(item.conversationId)) {
        const conv = conversationMap.get(item.conversationId)!;
        details.conversationChannel = conv.channelType;

        if (!details.guestName && conv.guestId && guestMap.has(conv.guestId)) {
          const guest = guestMap.get(conv.guestId)!;
          details.guestName = `${guest.firstName} ${guest.lastName}`;
        }

        // Get conversation messages (filter by createdAt and limit to 10)
        const allConvMessages = conversationMessagesMap.get(item.conversationId) || [];
        const filteredMessages = allConvMessages
          .filter((msg) => msg.createdAt <= item.createdAt)
          .slice(0, 10)
          .reverse(); // Oldest first
        details.conversationMessages = filteredMessages;
      }

      // Get staff name
      if (item.decidedBy && staffMap.has(item.decidedBy)) {
        details.staffName = staffMap.get(item.decidedBy);
      }

      // Get room number
      const guestIdForRoom = item.guestId || (item.conversationId && conversationMap.get(item.conversationId)?.guestId);
      if (guestIdForRoom && roomNumberMap.has(guestIdForRoom)) {
        details.roomNumber = roomNumberMap.get(guestIdForRoom);
      }

      return details;
    });
  }
}

// ===================
// Singleton
// ===================

let cachedQueue: ApprovalQueue | null = null;

/**
 * Get the approval queue singleton
 */
export function getApprovalQueue(): ApprovalQueue {
  if (!cachedQueue) {
    cachedQueue = new ApprovalQueue();
    log.info('Approval queue initialized');
  }
  return cachedQueue;
}

/**
 * Reset cached queue (for testing)
 */
export function resetApprovalQueue(): void {
  cachedQueue = null;
}
