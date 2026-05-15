/**
 * AI data shapes — request and response shapes used by `AIProvider`.
 *
 * @module types/ai
 */

/**
 * Hint to the provider about which model tier to use:
 * - `'utility'` — cheaper/faster model, suitable for classification, translation,
 *   detection, and other structured-output tasks.
 * - `'reasoning'` — main model, suitable for response generation.
 *
 * Implementations may map both to the same model if they don't need the
 * distinction (or treat as a hint and ignore).
 */
export type AIModelTier = 'utility' | 'reasoning';

export interface AICompletionMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface AICompletionRequest {
  readonly messages: readonly AICompletionMessage[];

  /** 0–2. Lower = more deterministic. */
  readonly temperature?: number;

  /** Output length cap. */
  readonly maxTokens?: number;

  /** Which model tier the caller would prefer. */
  readonly modelTier?: AIModelTier;

  /**
   * Free-form telemetry tag identifying what this call is for
   * (`'intent_classification'`, `'translation'`, `'response_generation'`, …).
   * Useful for cost/latency dashboards.
   */
  readonly purpose?: string;

  /**
   * Optional hook for callers to attach structured fields to the
   * provider's per-call telemetry row. The callback receives the raw
   * response text and returns an object that gets merged into the
   * provider's app_log/telemetry `details`.
   *
   * Useful for purposes whose responses have structure the caller
   * already parses — `classify-intent` returns `{parsedIntent,
   * parsedConfidence}`, `detect-language` returns
   * `{detectedLanguage}`, credential-extraction returns
   * `{extractedLastName, extractedConfirmation}`, etc. These fields
   * land in the System Health dashboard alongside model/tokens/latency
   * and can be filtered/aggregated on.
   *
   * Implementations may ignore this if their telemetry pipeline can't
   * accept extra fields.
   */
  readonly logFields?: (response: string) => Readonly<Record<string, unknown>>;
}

export interface AICompletionResult {
  readonly content: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

export interface AIEmbeddingRequest {
  readonly text: string;
}

export interface AIEmbeddingResult {
  readonly embedding: readonly number[];
  readonly usage?: {
    readonly inputTokens: number;
  };
}
