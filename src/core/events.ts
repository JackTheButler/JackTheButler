import { EventEmitter } from 'node:events';
import type { MessageDTO } from '@janetheoperator/shared';

/**
 * Tiny in-process event bus. Lets transport-agnostic services announce
 * domain events without knowing about sockets — the webchat gateway
 * subscribes and pushes. Keeps services free of hono/WS (architecture
 * guardrail) while still enabling real-time delivery.
 */

export interface MessageCreated {
  conversationId: string;
  channel: string;
  channelExternalId: string;
  message: MessageDTO;
}

interface EventMap {
  'message.created': MessageCreated;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export const events = {
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    emitter.emit(event, payload);
  },
  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): () => void {
    emitter.on(event, handler);
    return () => emitter.off(event, handler);
  },
};
