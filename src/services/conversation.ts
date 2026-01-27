/**
 * Conversation Service
 *
 * Manages conversations and messages between guests and the system.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db, conversations, messages, guests, staff } from '@/db/index.js';
import type { Conversation, Message } from '@/db/schema.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { events, EventTypes } from '@/events/index.js';
import { NotFoundError } from '@/errors/index.js';
import type {
  ChannelType,
  ConversationState,
  ConversationSummary,
  ConversationDetails,
  UpdateConversationInput,
  CreateMessageInput,
} from '@/types/index.js';

const log = createLogger('conversation');

/**
 * Options for listing conversations
 */
export interface ListConversationsOptions {
  state?: ConversationState | undefined;
  assignedTo?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Options for getting messages
 */
export interface GetMessagesOptions {
  limit?: number | undefined;
  before?: string | undefined;
}

export class ConversationService {
  /**
   * Find an active conversation or create a new one
   */
  async findOrCreate(channelType: ChannelType, channelId: string): Promise<Conversation> {
    // Find existing active conversation
    const [existing] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.channelType, channelType),
          eq(conversations.channelId, channelId),
          eq(conversations.state, 'active')
        )
      )
      .limit(1);

    if (existing) {
      log.debug({ conversationId: existing.id }, 'Found existing conversation');
      return existing;
    }

    // Create new conversation
    const id = generateId('conversation');
    const now = new Date().toISOString();

    await db.insert(conversations).values({
      id,
      channelType,
      channelId,
      state: 'active',
      metadata: '{}',
      createdAt: now,
      updatedAt: now,
    });

    log.info({ conversationId: id, channelType, channelId }, 'Created new conversation');

    // Emit event
    events.emit({
      type: EventTypes.CONVERSATION_CREATED,
      conversationId: id,
      channel: channelType,
      channelId,
      timestamp: new Date(),
    });

    return this.findById(id) as Promise<Conversation>;
  }

  /**
   * Find conversation by ID
   */
  async findById(id: string): Promise<Conversation | null> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);

    return conversation || null;
  }

  /**
   * Get conversation by ID (throws if not found)
   */
  async getById(id: string): Promise<Conversation> {
    const conversation = await this.findById(id);
    if (!conversation) {
      throw new NotFoundError('Conversation', id);
    }
    return conversation;
  }

  /**
   * List conversations with optional filters
   */
  async list(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    // Build query with dynamic filters
    let query = db
      .select({
        id: conversations.id,
        channelType: conversations.channelType,
        channelId: conversations.channelId,
        state: conversations.state,
        guestId: conversations.guestId,
        assignedTo: conversations.assignedTo,
        currentIntent: conversations.currentIntent,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    // Apply filters
    const conditions = [];
    if (options.state) {
      conditions.push(eq(conversations.state, options.state));
    }
    if (options.assignedTo) {
      conditions.push(eq(conversations.assignedTo, options.assignedTo));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    // Get message counts
    const conversationIds = results.map((c) => c.id);
    const counts = await this.getMessageCounts(conversationIds);

    return results.map((c) => ({
      ...c,
      channelType: c.channelType as ChannelType,
      state: c.state as ConversationState,
      messageCount: counts.get(c.id) || 0,
    }));
  }

  /**
   * Get conversation details with related data
   */
  async getDetails(id: string): Promise<ConversationDetails> {
    const conversation = await this.getById(id);
    const messageCount = (await this.getMessageCounts([id])).get(id) || 0;

    // Get guest name if linked
    let guestName: string | undefined;
    if (conversation.guestId) {
      const [guest] = await db.select().from(guests).where(eq(guests.id, conversation.guestId)).limit(1);
      if (guest) {
        guestName = `${guest.firstName} ${guest.lastName}`;
      }
    }

    // Get assigned staff name if assigned
    let assignedName: string | undefined;
    if (conversation.assignedTo) {
      const [assigned] = await db.select().from(staff).where(eq(staff.id, conversation.assignedTo)).limit(1);
      if (assigned) {
        assignedName = assigned.name;
      }
    }

    const result: ConversationDetails = {
      id: conversation.id,
      channelType: conversation.channelType as ChannelType,
      channelId: conversation.channelId,
      state: conversation.state as ConversationState,
      guestId: conversation.guestId,
      reservationId: conversation.reservationId,
      assignedTo: conversation.assignedTo,
      currentIntent: conversation.currentIntent,
      metadata: JSON.parse(conversation.metadata || '{}'),
      lastMessageAt: conversation.lastMessageAt,
      resolvedAt: conversation.resolvedAt,
      messageCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };

    if (guestName) {
      result.guestName = guestName;
    }
    if (assignedName) {
      result.assignedName = assignedName;
    }

    return result;
  }

  /**
   * Update a conversation
   */
  async update(id: string, input: UpdateConversationInput): Promise<Conversation> {
    const conversation = await this.getById(id);

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.state !== undefined) {
      updates.state = input.state;
      if (input.state === 'resolved') {
        updates.resolvedAt = new Date().toISOString();
      }
    }

    if (input.assignedTo !== undefined) {
      updates.assignedTo = input.assignedTo;
    }

    if (input.currentIntent !== undefined) {
      updates.currentIntent = input.currentIntent;
    }

    if (input.metadata !== undefined) {
      const existing = JSON.parse(conversation.metadata || '{}');
      updates.metadata = JSON.stringify({ ...existing, ...input.metadata });
    }

    await db.update(conversations).set(updates).where(eq(conversations.id, id));

    log.info({ conversationId: id, updates }, 'Conversation updated');

    // Emit event
    const eventChanges: { state?: ConversationState; assignedTo?: string | null; currentIntent?: string } = {};
    if (input.state !== undefined) {
      eventChanges.state = input.state;
    }
    if (input.assignedTo !== undefined) {
      eventChanges.assignedTo = input.assignedTo;
    }
    if (input.currentIntent !== undefined) {
      eventChanges.currentIntent = input.currentIntent;
    }

    events.emit({
      type: EventTypes.CONVERSATION_UPDATED,
      conversationId: id,
      changes: eventChanges,
      timestamp: new Date(),
    });

    return this.getById(id);
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(conversationId: string, input: CreateMessageInput): Promise<Message> {
    // Verify conversation exists
    await this.getById(conversationId);

    const id = generateId('message');
    const now = new Date().toISOString();

    await db.insert(messages).values({
      id,
      conversationId,
      direction: input.direction,
      senderType: input.senderType,
      senderId: input.senderId ?? null,
      content: input.content,
      contentType: input.contentType,
      channelMessageId: input.channelMessageId ?? null,
      intent: input.intent ?? null,
      confidence: input.confidence ?? null,
      entities: input.entities ? JSON.stringify(input.entities) : null,
      deliveryStatus: 'sent',
      createdAt: now,
    });

    // Update conversation last_message_at
    await db
      .update(conversations)
      .set({
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(conversations.id, conversationId));

    log.debug({ messageId: id, conversationId, direction: input.direction }, 'Message added');

    const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return message!;
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, options: GetMessagesOptions = {}): Promise<Message[]> {
    const limit = options.limit ?? 50;

    // Verify conversation exists
    await this.getById(conversationId);

    let query = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    if (options.before) {
      // Get messages before a specific message
      const [beforeMsg] = await db.select().from(messages).where(eq(messages.id, options.before)).limit(1);
      if (beforeMsg) {
        query = db
          .select()
          .from(messages)
          .where(and(eq(messages.conversationId, conversationId), sql`${messages.createdAt} < ${beforeMsg.createdAt}`))
          .orderBy(desc(messages.createdAt))
          .limit(limit);
      }
    }

    const results = await query;
    return results.reverse(); // Return in chronological order
  }

  /**
   * Get message counts for multiple conversations
   */
  private async getMessageCounts(conversationIds: string[]): Promise<Map<string, number>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const counts = await db
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(messages)
      .where(sql`${messages.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(messages.conversationId);

    return new Map(counts.map((c) => [c.conversationId, c.count]));
  }
}

/**
 * Singleton instance
 */
export const conversationService = new ConversationService();
