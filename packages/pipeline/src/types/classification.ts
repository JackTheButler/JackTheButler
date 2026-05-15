/**
 * ClassificationResult — output of the intent classification stage.
 *
 * Set by `classify-intent` on `MessageContext.classification`. Read by
 * the responder (the intent informs prompt context) and by downstream
 * stages that need to know what the user wants.
 *
 * @module types/classification
 */

export interface ClassificationResult {
  /**
   * The chosen intent name. Typically matches a name in
   * `IntentProvider.list()`. Implementations should use `'unknown'` (or
   * similar sentinel) when no intent matches confidently.
   */
  readonly intent: string;

  /** Classifier's confidence in the chosen intent, 0..1. */
  readonly confidence: number;

  /** Optional human-readable explanation (useful for debugging). */
  readonly reasoning?: string;
}
