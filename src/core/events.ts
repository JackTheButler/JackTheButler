import { EventEmitter } from 'node:events';
import type { MessageDTO } from '@janetheoperator/shared';
import type { Job } from '@/core/jobs.js';

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

/** Patch event for a message that was created earlier and has since been
 *  enriched in-flight — e.g. the AI pipeline's `enrichInboundMessage`
 *  stage populating `language` + `translation` on the just-saved
 *  customer turn after detection runs. Consumers patch their cached
 *  copy by `messageId`. */
export interface MessageUpdated {
  conversationId: string;
  channel: string;
  channelExternalId: string;
  messageId: string;
  language: string | null;
  translation: string | null;
}

/** Every event the in-process bus can carry. Realtime.ts forwards a subset
 *  of these to dashboard sockets; add a key here + a `forward(...)` line in
 *  realtime.ts to surface a new event type to the UI. */
/** Someone is composing a reply — drives a "typing…" indicator. No explicit
 *  "stop": the eventual `message.created` ends it (plus a client-side safety
 *  timeout). Two sources:
 *   - `assistant.typing`: the AI pipeline, before the slow generation call →
 *     shown in both the widget and the dashboard inbox.
 *   - `staff.typing`: an agent typing in the inbox composer (human mode) →
 *     forwarded to the widget so the customer sees the agent composing. */
export interface TypingSignal {
  conversationId: string;
  channel: string;
  channelExternalId: string;
}

export interface EventMap {
  'message.created': MessageCreated;
  'message.updated': MessageUpdated;
  'assistant.typing': TypingSignal;
  'staff.typing': TypingSignal;
  'job.progress': Job;
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
