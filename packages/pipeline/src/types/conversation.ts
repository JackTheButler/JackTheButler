/**
 * Conversation — the thread that messages belong to, plus the shape used
 * to append a new message to it.
 *
 * The pipeline reads a `Conversation` after `resolve-conversation` runs,
 * and uses its `id` to persist subsequent messages. The shape here is the
 * minimum the pipeline cares about; consumers with a richer DB schema
 * extend this interface — TypeScript's structural typing means their
 * `HotelConversation` just needs to *include* these fields.
 *
 * @module types/conversation
 */

export interface Conversation {
  /** Unique identifier for the thread. */
  readonly id: string;

  /** The channel this thread is on. Matches the `channel` on inbound messages. */
  readonly channel: string;

  /** The sender's identifier on the channel. Matches `InboundMessage.channelId`. */
  readonly channelId: string;

  /**
   * The resolved entity for this thread.
   * `null` when the thread is not linked to any entity (e.g. anonymous webchat).
   */
  readonly entityId: string | null;

  /** When the thread was first created. */
  readonly createdAt: Date;

  /** When the thread was last touched. */
  readonly updatedAt: Date;

  /**
   * BCP-47 code of the language the conversation is conducted in (user
   * side; the system side is `Env.systemLanguage`). Optional —
   * implementations may not track per-conversation language.
   *
   * Typically populated/updated by the consumer based on
   * `MessageContext.inboundLanguage` produced by `detectLanguage`, then
   * read by translation stages and by consumers outside the pipeline
   * (e.g. staff-reply translation, dashboard language badges) so they
   * know what language to operate in even if a given turn's detection
   * fails.
   */
  readonly language?: string;

  /** Consumer-defined extras (state, assignment, …). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A single conversation turn. Used three places with the same shape:
 *   - input to `ConversationProvider.addMessage`
 *   - element of `ConversationProvider.getRecentMessages` return
 *   - element of `MessageContext.history`
 *
 * Distinct from `InboundMessage` / `OutboundMessage` — those are wire-format
 * messages with channel info; `Message` is a conversation turn (role + content).
 */
export interface Message {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  /**
   * BCP-47 language code of the content (e.g. `'en'`, `'fr'`).
   * Populated by `saveInboundMessage` from `ctx.inboundLanguage` when the
   * detect stage ran. Consumers may persist this to a separate column so
   * that subsequent reads (history, staff replies, dashboards) know what
   * language the original turn was in.
   */
  readonly language?: string;
  /**
   * The content translated into the system language, when the original
   * differed. Populated by `saveInboundMessage` from `ctx.inboundTranslation`.
   * Consumers that show a history of mixed-language threads may render
   * either `content` or `translation` depending on the viewer.
   */
  readonly translation?: string;
  /** Channel-specific extras, AI metadata, debug info, etc. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
