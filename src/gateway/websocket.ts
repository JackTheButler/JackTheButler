/**
 * WebSocket Server
 *
 * Real-time communication for:
 * - Staff dashboard notifications (/ws)
 * - Guest webchat (/chat)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { jwtVerify } from 'jose';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';
import { handleChatConnection } from '@/channels/webchat/index.js';

const log = createLogger('websocket');

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  role?: string;
  isAlive: boolean;
}

interface WSMessage {
  type: string;
  payload?: unknown;
}

/**
 * Active WebSocket connections (staff dashboard)
 */
const clients = new Map<string, Set<AuthenticatedSocket>>();

/**
 * Setup WebSocket server on existing HTTP server
 */
export function setupWebSocket(server: Server): WebSocketServer {
  // Staff dashboard WebSocket server (noServer mode for manual routing)
  const wss = new WebSocketServer({ noServer: true });
  const config = loadConfig();
  const secret = new TextEncoder().encode(config.jwt.secret);

  // Guest chat WebSocket server (noServer mode for manual routing)
  const chatWss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade requests manually to route to correct WebSocket server
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/chat') {
      chatWss.handleUpgrade(request, socket, head, (ws) => {
        chatWss.emit('connection', ws, request);
      });
    } else {
      // Unknown WebSocket path - destroy connection
      socket.destroy();
    }
  });

  // Heartbeat interval to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (!socket.isAlive) {
        log.debug({ userId: socket.userId }, 'Terminating dead connection');
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Handle staff dashboard connections
  wss.on('connection', async (ws: AuthenticatedSocket, req) => {
    ws.isAlive = true;

    // Handle pong responses
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Try to authenticate from query string token
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (token) {
      try {
        const { payload } = await jwtVerify(token, secret);
        if (payload.type !== 'refresh') {
          ws.userId = payload.sub as string;
          ws.role = payload.role as string;

          // Track authenticated connection
          if (!clients.has(ws.userId)) {
            clients.set(ws.userId, new Set());
          }
          clients.get(ws.userId)!.add(ws);

          log.info({ userId: ws.userId }, 'Authenticated WebSocket connection');
        }
      } catch {
        log.debug('Invalid WebSocket token');
      }
    }

    // Send welcome message
    sendMessage(ws, {
      type: 'connected',
      payload: {
        authenticated: !!ws.userId,
        timestamp: Date.now(),
      },
    });

    log.info({ authenticated: !!ws.userId }, 'WebSocket client connected');

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        handleMessage(ws, message);
      } catch (error) {
        log.warn({ error }, 'Invalid WebSocket message');
        sendMessage(ws, {
          type: 'error',
          payload: { message: 'Invalid message format' },
        });
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(ws.userId);
          }
        }
      }
      log.info({ userId: ws.userId }, 'WebSocket client disconnected');
    });

    // Handle errors
    ws.on('error', (error) => {
      log.error({ error, userId: ws.userId }, 'WebSocket error');
    });
  });

  // Handle guest chat connections
  chatWss.on('connection', (ws) => {
    handleChatConnection(ws);
  });

  log.info('WebSocket server started on /ws (staff) and /chat (guests)');

  return wss;
}

/**
 * Handle incoming WebSocket messages (staff dashboard)
 */
function handleMessage(ws: AuthenticatedSocket, message: WSMessage) {
  log.debug({ type: message.type, userId: ws.userId }, 'Received message');

  switch (message.type) {
    case 'ping':
      sendMessage(ws, { type: 'pong', payload: { timestamp: Date.now() } });
      break;

    case 'subscribe':
      // Future: subscribe to specific channels/topics
      sendMessage(ws, {
        type: 'subscribed',
        payload: { topic: message.payload },
      });
      break;

    default:
      sendMessage(ws, {
        type: 'error',
        payload: { message: `Unknown message type: ${message.type}` },
      });
  }
}

/**
 * Send a message to a WebSocket client
 */
function sendMessage(ws: WebSocket, message: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Broadcast a message to all authenticated clients
 */
export function broadcast(message: WSMessage) {
  const data = JSON.stringify(message);
  clients.forEach((sockets) => {
    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  });
}

/**
 * Send a message to a specific user
 */
export function sendToUser(userId: string, message: WSMessage) {
  const userClients = clients.get(userId);
  if (userClients) {
    const data = JSON.stringify(message);
    userClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

/**
 * Get count of connected clients
 */
export function getConnectionCount(): number {
  let count = 0;
  clients.forEach((sockets) => {
    count += sockets.size;
  });
  return count;
}
