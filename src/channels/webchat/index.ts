/**
 * WebChat Channel Adapter
 *
 * Handles WebSocket-based guest chat for testing and web widget.
 */

import { WebSocket } from 'ws';
import type { ChannelAdapter, WSIncoming, WSOutgoing } from '../types.js';
import type { InboundMessage, OutboundMessage, SendResult, ChannelType } from '@/types/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { messageProcessor } from '@/pipeline/index.js';

const log = createLogger('webchat');

/**
 * Extended WebSocket with session tracking
 */
export interface ChatSocket extends WebSocket {
  sessionId: string;
  conversationId?: string;
  isAlive: boolean;
}

/**
 * Active chat sessions
 */
const sessions = new Map<string, ChatSocket>();

/**
 * WebChat adapter implementation
 */
export class WebChatAdapter implements ChannelAdapter {
  readonly channel: ChannelType = 'webchat';

  /**
   * Send a message to a WebSocket session
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    // Find the session for this conversation
    const session = Array.from(sessions.values()).find(
      (s) => s.conversationId === message.conversationId
    );

    if (!session || session.readyState !== WebSocket.OPEN) {
      return {
        success: false,
        error: 'Session not found or closed',
      };
    }

    const outgoing: WSOutgoing = {
      type: 'message',
      content: message.content,
      conversationId: message.conversationId,
      timestamp: Date.now(),
    };

    session.send(JSON.stringify(outgoing));

    return {
      success: true,
      channelMessageId: `ws_${Date.now()}`,
    };
  }

  /**
   * Parse incoming WebSocket message
   */
  async parseIncoming(raw: unknown): Promise<InboundMessage> {
    const data = raw as { sessionId: string; message: WSIncoming };

    if (data.message.type !== 'message') {
      throw new Error('Not a chat message');
    }

    return {
      id: generateId('message'),
      channel: 'webchat',
      channelId: data.sessionId,
      content: data.message.content,
      contentType: data.message.contentType || 'text',
      timestamp: new Date(),
      raw: data,
    };
  }
}

/**
 * Handle a new WebSocket chat connection
 */
export function handleChatConnection(ws: WebSocket): void {
  const socket = ws as ChatSocket;
  socket.sessionId = generateId('session');
  socket.isAlive = true;

  // Track session
  sessions.set(socket.sessionId, socket);

  log.info({ sessionId: socket.sessionId }, 'Chat session started');

  // Send connected message
  sendToSocket(socket, {
    type: 'connected',
    sessionId: socket.sessionId,
    authenticated: false,
    timestamp: Date.now(),
  });

  // Handle pong for heartbeat
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  // Handle incoming messages
  socket.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString()) as WSIncoming;
      await handleChatMessage(socket, parsed);
    } catch (error) {
      log.warn({ error, sessionId: socket.sessionId }, 'Invalid chat message');
      sendToSocket(socket, {
        type: 'error',
        message: 'Invalid message format',
      });
    }
  });

  // Handle disconnection
  socket.on('close', () => {
    sessions.delete(socket.sessionId);
    log.info({ sessionId: socket.sessionId }, 'Chat session ended');
  });

  // Handle errors
  socket.on('error', (error) => {
    log.error({ error, sessionId: socket.sessionId }, 'Chat socket error');
  });
}

/**
 * Handle incoming chat message
 */
async function handleChatMessage(socket: ChatSocket, message: WSIncoming): Promise<void> {
  log.debug({ sessionId: socket.sessionId, type: message.type }, 'Received chat message');

  switch (message.type) {
    case 'ping':
      sendToSocket(socket, { type: 'connected', sessionId: socket.sessionId, authenticated: false, timestamp: Date.now() });
      break;

    case 'typing':
      // Could broadcast to staff dashboard
      break;

    case 'message':
      await processChat(socket, message);
      break;

    default:
      sendToSocket(socket, {
        type: 'error',
        message: 'Unknown message type',
      });
  }
}

/**
 * Process a chat message through the pipeline
 */
async function processChat(socket: ChatSocket, message: { content: string; contentType?: string }): Promise<void> {
  // Send typing indicator
  sendToSocket(socket, { type: 'typing', isTyping: true });

  try {
    // Create inbound message
    const inbound: InboundMessage = {
      id: generateId('message'),
      channel: 'webchat',
      channelId: socket.sessionId,
      content: message.content,
      contentType: (message.contentType as 'text' | 'image') || 'text',
      timestamp: new Date(),
    };

    // Process through pipeline
    const response = await messageProcessor.process(inbound);

    // Store conversation ID for future reference
    socket.conversationId = response.conversationId;

    // Stop typing indicator
    sendToSocket(socket, { type: 'typing', isTyping: false });

    // Send response
    sendToSocket(socket, {
      type: 'message',
      content: response.content,
      conversationId: response.conversationId,
      timestamp: Date.now(),
    });
  } catch (error) {
    log.error({ error, sessionId: socket.sessionId }, 'Error processing chat message');

    sendToSocket(socket, { type: 'typing', isTyping: false });
    sendToSocket(socket, {
      type: 'error',
      message: 'Failed to process message',
    });
  }
}

/**
 * Send a message to a socket
 */
function sendToSocket(socket: WebSocket, message: WSOutgoing): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * Get active session count
 */
export function getSessionCount(): number {
  return sessions.size;
}

/**
 * Singleton adapter instance
 */
export const webChatAdapter = new WebChatAdapter();
