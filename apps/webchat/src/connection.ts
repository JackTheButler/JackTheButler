/**
 * WebSocket Connection Manager
 *
 * Handles connect, reconnect, heartbeat, and message dispatching.
 * Ported from test.html lines 361-477.
 */

import {
  INITIAL_RECONNECT_DELAY,
  MAX_RECONNECT_DELAY,
  PING_INTERVAL,
  RECONNECT_MULTIPLIER,
} from './constants.js';
import { getToken, setToken } from './session.js';
import type {
  ServerMessage,
  SessionMessage,
  SessionUpdateMessage,
  HistoryMessage,
  ChatMessage,
  VerificationStatus,
} from './types.js';

export interface ConnectionCallbacks {
  onSession(msg: SessionMessage): void;
  onSessionUpdate(msg: SessionUpdateMessage): void;
  onHistory(msg: HistoryMessage): void;
  onMessage(msg: ChatMessage): void;
  onError(message: string): void;
  onConnected(): void;
  onDisconnected(): void;
}

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly gatewayOrigin: string,
    private readonly callbacks: ConnectionCallbacks
  ) {}

  connect(): void {
    if (this.destroyed) return;
    this.cleanup();

    const protocol = this.gatewayOrigin.startsWith('https') ? 'wss:' : 'ws:';
    const host = this.gatewayOrigin.replace(/^https?:\/\//, '');
    let url = `${protocol}//${host}/ws/chat`;

    const token = getToken();
    if (token) {
      url += `?token=${encodeURIComponent(token)}`;
    }

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      this.startPing();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as ServerMessage;
        this.dispatch(data);
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onclose = () => {
      this.stopPing();
      this.callbacks.onDisconnected();
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(
            this.reconnectDelay * RECONNECT_MULTIPLIER,
            MAX_RECONNECT_DELAY
          );
          this.connect();
        }, this.reconnectDelay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendMessage(content: string): void {
    this.send({ type: 'message', content });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanup();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private dispatch(data: ServerMessage): void {
    switch (data.type) {
      case 'session':
        setToken(data.token);
        this.callbacks.onSession(data);
        this.callbacks.onConnected();
        break;
      case 'session_update':
        this.callbacks.onSessionUpdate(data);
        break;
      case 'history':
        this.callbacks.onHistory(data);
        break;
      case 'message':
        this.callbacks.onMessage(data);
        break;
      case 'error':
        this.callbacks.onError(data.message);
        break;
      case 'pong':
        break;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanup(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Re-export VerificationStatus for convenience
export type { VerificationStatus };
