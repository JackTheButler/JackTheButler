/**
 * Channel Types
 *
 * Interfaces for channel adapters.
 */

import type { ChannelType, InboundMessage, OutboundMessage, SendResult } from '@/types/index.js';

/**
 * Channel adapter interface
 * All channel implementations must follow this contract.
 */
export interface ChannelAdapter {
  /** Channel type identifier */
  readonly channel: ChannelType;

  /**
   * Send a message through this channel
   */
  send(message: OutboundMessage): Promise<SendResult>;

  /**
   * Parse raw incoming data into a structured message
   */
  parseIncoming(raw: unknown): Promise<InboundMessage>;
}

/**
 * WebSocket message types
 */
export interface WSChatMessage {
  type: 'message';
  content: string;
  contentType?: 'text' | 'image';
}

export interface WSTypingMessage {
  type: 'typing';
  isTyping: boolean;
}

export interface WSPingMessage {
  type: 'ping';
}

export type WSIncoming = WSChatMessage | WSTypingMessage | WSPingMessage;

export interface WSOutgoingMessage {
  type: 'message';
  content: string;
  conversationId: string;
  timestamp: number;
}

export interface WSTypingIndicator {
  type: 'typing';
  isTyping: boolean;
}

export interface WSConnectedMessage {
  type: 'connected';
  sessionId: string;
  authenticated: boolean;
  timestamp: number;
}

export interface WSErrorMessage {
  type: 'error';
  message: string;
}

export type WSOutgoing = WSOutgoingMessage | WSTypingIndicator | WSConnectedMessage | WSErrorMessage;
