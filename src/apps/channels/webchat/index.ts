/**
 * WebChat Channel App
 *
 * Built-in web chat widget for hotel websites.
 * Self-hosted, no external API keys required — auto-activates on startup.
 *
 * Phase 2: Persistent sessions via token in localStorage.
 * Multiple tabs with the same token share a single session and conversation.
 *
 * @module apps/channels/webchat
 */

import { WebSocket } from 'ws';
import type { ChannelAppManifest } from '../../types.js';
import type { ChannelAdapter } from '@/core/interfaces/channel.js';
import type { InboundMessage, OutboundMessage } from '@/core/interfaces/channel.js';
import type { ContentType, SendResult, ChannelType } from '@/types/index.js';
import { messageProcessor } from '@/core/message-processor.js';
import { conversationService } from '@/services/conversation.js';
import { webchatSessionService } from '@/services/webchat-session.js';
import { webchatActionService } from '@/services/webchat-action.js';
import type { WebChatSession } from '@/db/schema.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import type { IncomingMessage } from 'node:http';

const log = createLogger('apps:channels:webchat');

// ============================================
// Connection Manager
// ============================================

/**
 * Manages WebSocket connections for webchat guests.
 * Supports multiple tabs per session (same sessionId → multiple sockets).
 */
class WebChatConnectionManager {
  private connections = new Map<string, Set<WebSocket>>();

  /** Add a WebSocket to a session ID */
  add(id: string, ws: WebSocket): void {
    if (!this.connections.has(id)) {
      this.connections.set(id, new Set());
    }
    this.connections.get(id)!.add(ws);
  }

  /** Remove a WebSocket from a session ID */
  remove(id: string, ws: WebSocket): void {
    const sockets = this.connections.get(id);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.connections.delete(id);
      }
    }
  }

  /** Remove all connections for an ID */
  removeAll(id: string): void {
    this.connections.delete(id);
  }

  /** Send a message to all connections for an ID */
  send(id: string, message: object): boolean {
    const sockets = this.connections.get(id);
    if (!sockets || sockets.size === 0) return false;

    const data = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
    return true;
  }

  /** Send a message to all connections except the excluded one */
  sendToOthers(id: string, exclude: WebSocket, message: object): boolean {
    const sockets = this.connections.get(id);
    if (!sockets || sockets.size === 0) return false;

    const data = JSON.stringify(message);
    let sent = false;
    for (const ws of sockets) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        sent = true;
      }
    }
    return sent;
  }

  /** Get number of active connections for an ID */
  getCount(id: string): number {
    return this.connections.get(id)?.size ?? 0;
  }
}

export const webchatConnectionManager = new WebChatConnectionManager();

// ============================================
// Adapter
// ============================================

/**
 * Webchat adapter object.
 *
 * sendToChannel() calls connectionManager directly, not this adapter.
 * This exists for manifest/interface compliance only.
 */
const webchatAdapter = {
  id: 'channel-webchat',
  channel: 'webchat' as ChannelType,

  async send(_message: OutboundMessage): Promise<SendResult> {
    return { status: 'sent' };
  },

  async parseIncoming(raw: unknown): Promise<InboundMessage> {
    const data = raw as { content: string; contentType?: string };
    return {
      id: generateId('message'),
      channel: 'webchat',
      channelId: '',
      content: data.content,
      contentType: (data.contentType || 'text') as ContentType,
      timestamp: new Date(),
    };
  },
};

// ============================================
// Guest Connection Handler
// ============================================

interface GuestSocket extends WebSocket {
  isAlive: boolean;
}

/**
 * Parse the token query parameter from the WebSocket upgrade request URL.
 */
function parseToken(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}

/**
 * Handle a new guest WebSocket connection on /ws/chat.
 * Called by the gateway's WebSocket server.
 *
 * Session flow:
 * 1. Parse ?token= from URL
 * 2. If token present → validate → restore session or create new (expired)
 * 3. No token → create new session
 */
export function handleGuestConnection(ws: GuestSocket, req: IncomingMessage): void {
  handleGuestConnectionAsync(ws, req).catch((error) => {
    log.error({ error }, 'Failed to handle guest connection');
    ws.send(JSON.stringify({ type: 'error', message: 'Connection failed' }));
    ws.close();
  });
}

async function handleGuestConnectionAsync(ws: GuestSocket, req: IncomingMessage): Promise<void> {
  const token = parseToken(req);
  let session: WebChatSession;
  let restored = false;
  let previousExpired = false;

  if (token) {
    const existing = await webchatSessionService.validate(token);
    if (existing) {
      session = existing;
      restored = true;
      log.info({ sessionId: session.id }, 'Guest webchat reconnected (session restored)');
    } else {
      // Token was invalid or expired — create fresh session
      session = await webchatSessionService.create();
      previousExpired = true;
      log.info({ sessionId: session.id }, 'Guest webchat connected (previous session expired)');
    }
  } else {
    session = await webchatSessionService.create();
    log.info({ sessionId: session.id }, 'Guest webchat connected (new session)');
  }

  const sessionId = session.id;
  webchatConnectionManager.add(sessionId, ws);

  // Send session info
  ws.send(
    JSON.stringify({
      type: 'session',
      token: session.token,
      sessionId,
      restored,
      previousExpired,
      verificationStatus: session.verificationStatus,
    })
  );

  // If restored and has a conversation, send history
  if (restored && session.conversationId) {
    try {
      const messages = await conversationService.getMessages(session.conversationId, { limit: 50 });
      ws.send(
        JSON.stringify({
          type: 'history',
          messages: messages.map((m) => ({
            direction: m.direction,
            senderType: m.senderType,
            content: m.content,
            timestamp: m.createdAt,
          })),
        })
      );
    } catch (error) {
      log.warn({ error, sessionId, conversationId: session.conversationId }, 'Failed to load history');
    }
  }

  // Handle messages
  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());

      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }

      if (parsed.type === 'message') {
        handleGuestMessage(sessionId, ws, parsed.content).catch((error) => {
          log.error({ error, sessionId }, 'Failed to process webchat message');
          webchatConnectionManager.send(sessionId, {
            type: 'error',
            message: "I'm sorry, I encountered an error processing your request. Please try again.",
          });
        });
        return;
      }

      log.debug({ type: parsed.type, sessionId }, 'Unknown webchat message type');
    } catch (error) {
      log.warn({ error, sessionId }, 'Invalid webchat message');
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // Handle close — session persists in DB, only WS removed
  ws.on('close', () => {
    webchatConnectionManager.remove(sessionId, ws);
    log.info({ sessionId }, 'Guest webchat disconnected');
  });

  // Handle errors
  ws.on('error', (error) => {
    log.error({ error, sessionId }, 'Guest webchat error');
    webchatConnectionManager.remove(sessionId, ws);
  });
}

// ============================================
// Channel Actions
// ============================================

/**
 * Build structured channel actions metadata for the AI responder.
 * The responder owns the prompt — we just pass the data.
 */
function buildChannelActions(verificationStatus?: string) {
  const actions = webchatActionService.getActions();
  return {
    actions: actions.map((a) => ({
      id: a.id,
      triggerHint: a.triggerHint,
      requiresVerification: a.requiresVerification,
    })),
    verificationStatus: verificationStatus ?? 'anonymous',
  };
}

// ============================================
// Message Handler
// ============================================

/**
 * Process a guest chat message through the message pipeline
 */
async function handleGuestMessage(
  sessionId: string,
  senderWs: WebSocket,
  content: string
): Promise<void> {
  log.debug({ sessionId, contentLength: content.length }, 'Processing webchat message');

  // Fetch session for verification status
  const session = await webchatSessionService.findById(sessionId);

  // Touch session on every message
  await webchatSessionService.touch(sessionId);

  // Echo to other tabs
  webchatConnectionManager.sendToOthers(sessionId, senderWs, {
    type: 'message',
    direction: 'inbound',
    senderType: 'guest',
    content,
    timestamp: new Date().toISOString(),
  });

  // Build inbound message for message processor
  const inbound: InboundMessage = {
    id: generateId('message'),
    channel: 'webchat',
    channelId: sessionId,
    content,
    contentType: 'text',
    timestamp: new Date(),
    metadata: {
      channelActions: buildChannelActions(session?.verificationStatus),
    },
  };

  // Process through the core message pipeline
  const response = await messageProcessor.process(inbound);

  // Link conversation to session (idempotent — cheap UPDATE on every message)
  await webchatSessionService.linkConversation(sessionId, response.conversationId);

  // Read AI's suggested action (if any)
  const suggestedAction = response.metadata?.suggestedAction as string | undefined;
  let actionMeta: { id: string } | undefined;
  if (suggestedAction) {
    // Validate the action exists before sending to client
    const action = webchatActionService.getAction(suggestedAction);
    if (action) {
      actionMeta = { id: suggestedAction };
    } else {
      log.warn({ suggestedAction }, 'AI suggested unknown action, ignoring');
    }
  }

  // Send response to all tabs (include metadata for action triggers)
  webchatConnectionManager.send(sessionId, {
    type: 'message',
    direction: 'outbound',
    senderType: 'ai',
    content: response.content,
    conversationId: response.conversationId,
    timestamp: new Date().toISOString(),
    ...(actionMeta ? { action: actionMeta } : {}),
  });
}

// ============================================
// Manifest
// ============================================

export const manifest: ChannelAppManifest = {
  id: 'channel-webchat',
  name: 'Web Chat',
  category: 'channel',
  version: '0.1.0',
  description: 'Chat widget for hotel websites',
  icon: '💬',
  configSchema: [],
  features: {
    inbound: true,
    outbound: true,
    media: false,
  },
  createAdapter: () => webchatAdapter as unknown as ChannelAdapter,
};
