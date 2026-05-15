/**
 * Wire types for messages flowing into and out of the pipeline.
 *
 * `InboundMessage` is what the caller hands to `pipeline.process(...)`.
 * `OutboundMessage` is what `process` returns once a stage has persisted
 * the AI response to the conversation.
 *
 * Both are intentionally minimal — channel-specific fields (WhatsApp
 * message ID, webchat session token, raw vendor payload, etc.) live in
 * `metadata`. Consumers that need richer message shapes can extend these
 * interfaces.
 *
 * @module messages
 */

export interface InboundMessage {
  /** Unique identifier for this message. */
  readonly id: string;

  /** The channel this message arrived on, e.g. `'whatsapp'`, `'webchat'`, `'sms'`. */
  readonly channel: string;

  /** The sender's identifier on the channel (phone number, session id, email, …). */
  readonly channelId: string;

  /**
   * Explicit conversation id when the caller already knows the thread
   * (e.g. webchat sessions, Slack `thread_ts`, continuation flows). When
   * omitted, `resolve-conversation` finds-or-creates by channel + channelId.
   */
  readonly conversationId?: string;

  /** The message body, as text. Images / audio / etc. are not supported in V1. */
  readonly content: string;

  /** When the message record was created (typically when the channel produced it). */
  readonly createdAt: Date;

  /** Channel-specific extras. Free-form. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface OutboundMessage {
  /** Unique identifier assigned when the outbound message is persisted. */
  readonly id: string;

  /** The conversation this outbound belongs to. */
  readonly conversationId: string;

  /** The reply text sent to the user. */
  readonly content: string;

  /** When the outbound record was created. */
  readonly createdAt: Date;

  /** Channel-specific extras, AI metadata, debug info, etc. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
