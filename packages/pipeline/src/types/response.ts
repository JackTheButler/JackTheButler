/**
 * AIResponse — output of the response-generation stage.
 *
 * Set by `generate-response` on `MessageContext.aiResponse`. Read by
 * `translate-outbound` (for translating the response back to the user's
 * language) and `save-outbound-message` (which persists the content as
 * the `OutboundMessage`).
 *
 * @module types/response
 */

export interface AIResponse {
  /** The generated response text. */
  readonly content: string;

  /** Token usage from the LLM call, if reported by the provider. */
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };

  /**
   * Free-form metadata — provider name, action tags, quick replies,
   * detected entities, anything the responder wants to surface to
   * downstream stages or the outbound message.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
