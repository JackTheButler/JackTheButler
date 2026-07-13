/**
 * WebChat Connection Manager
 *
 * Manages active WebSocket connections and per-session locale state for the
 * webchat widget. Extracted from index.ts so actions.ts and verification.ts
 * can depend on it without importing index.ts (avoids an import cycle).
 *
 * @module apps/channels/webchat/connections
 */

import { WebSocket } from 'ws';
import type { SupportedLocale } from '@/locales/webchat/index.js';

// ============================================
// Session Locale Tracking
// ============================================

/** In-memory locale per session (no DB migration needed) */
const sessionLocales = new Map<string, SupportedLocale>();

export function getSessionLocale(sessionId: string): SupportedLocale {
  return sessionLocales.get(sessionId) ?? 'en';
}

export function setSessionLocale(sessionId: string, locale: SupportedLocale): void {
  sessionLocales.set(sessionId, locale);
}

export function deleteSessionLocale(sessionId: string): void {
  sessionLocales.delete(sessionId);
}

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
