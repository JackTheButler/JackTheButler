/**
 * Conversation Routes
 *
 * API endpoints for managing conversations and messages.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { conversationService } from '@/services/conversation.js';
import { validateBody, validateQuery } from '../middleware/validator.js';
import { requireAuth } from '../middleware/auth.js';
import type { ContentType, ChannelType } from '@/types/index.js';
import { getWhatsAppAdapter } from '@/channels/whatsapp/index.js';

// Validation schemas
const listQuerySchema = z.object({
  state: z.enum(['new', 'active', 'escalated', 'resolved', 'closed']).optional(),
  assignedTo: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const updateBodySchema = z.object({
  state: z.enum(['new', 'active', 'escalated', 'resolved', 'closed']).optional(),
  assignedTo: z.string().nullable().optional(),
  currentIntent: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const sendMessageBodySchema = z.object({
  content: z.string().min(1).max(4000),
  contentType: z.enum(['text', 'image']).default('text'),
});

const messagesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  before: z.string().optional(),
});

type Variables = {
  validatedBody: unknown;
  validatedQuery: unknown;
  userId: string;
};

const conversationsRouter = new Hono<{ Variables: Variables }>();

// Apply auth to all routes
conversationsRouter.use('/*', requireAuth);

/**
 * GET /api/v1/conversations
 * List conversations with optional filters
 */
conversationsRouter.get('/', validateQuery(listQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as z.infer<typeof listQuerySchema>;

  const conversations = await conversationService.list({
    state: query.state,
    assignedTo: query.assignedTo,
    limit: query.limit,
    offset: query.offset,
  });

  return c.json({
    conversations,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total: conversations.length, // TODO: add total count
    },
  });
});

/**
 * GET /api/v1/conversations/:id
 * Get conversation details
 */
conversationsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const conversation = await conversationService.getDetails(id);
  return c.json({ conversation });
});

/**
 * PATCH /api/v1/conversations/:id
 * Update conversation (state, assignment, etc.)
 */
conversationsRouter.patch('/:id', validateBody(updateBodySchema), async (c) => {
  const id = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof updateBodySchema>;

  const conversation = await conversationService.update(id, {
    state: body.state,
    assignedTo: body.assignedTo,
    currentIntent: body.currentIntent,
    metadata: body.metadata,
  });

  return c.json({ conversation });
});

/**
 * GET /api/v1/conversations/:id/messages
 * Get messages for a conversation
 */
conversationsRouter.get('/:id/messages', validateQuery(messagesQuerySchema), async (c) => {
  const id = c.req.param('id');
  const query = c.get('validatedQuery') as z.infer<typeof messagesQuerySchema>;

  const messages = await conversationService.getMessages(id, {
    limit: query.limit,
    before: query.before,
  });

  return c.json({
    messages,
    pagination: {
      limit: query.limit,
      before: query.before,
    },
  });
});

/**
 * POST /api/v1/conversations/:id/messages
 * Send a message as staff
 */
conversationsRouter.post('/:id/messages', validateBody(sendMessageBodySchema), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const body = c.get('validatedBody') as z.infer<typeof sendMessageBodySchema>;

  // Get conversation to know channel details
  const conversation = await conversationService.getById(id);

  const message = await conversationService.addMessage(id, {
    direction: 'outbound',
    senderType: 'staff',
    senderId: userId,
    content: body.content,
    contentType: body.contentType as ContentType,
  });

  // Send through channel adapter
  try {
    await sendToChannel(
      conversation.channelType as ChannelType,
      conversation.channelId,
      body.content
    );
  } catch (err) {
    // Log error but don't fail the request - message is saved
    console.error('Failed to send to channel:', err);
  }

  return c.json({ message }, 201);
});

/**
 * Send a message through the appropriate channel adapter
 */
async function sendToChannel(
  channelType: ChannelType,
  channelId: string,
  content: string
): Promise<void> {
  switch (channelType) {
    case 'whatsapp': {
      const adapter = getWhatsAppAdapter();
      if (adapter) {
        await adapter.send(channelId, { content, contentType: 'text' });
      }
      break;
    }
    // Other channels can be added here
    default:
      // No adapter for this channel
      break;
  }
}

export { conversationsRouter };
