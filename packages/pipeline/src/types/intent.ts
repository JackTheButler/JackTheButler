/**
 * Intent — one classifiable intent in the domain's catalog.
 *
 * Hospitality defines intents like `request.housekeeping.towels`; trading
 * defines intents like `position.check`; handyman defines `report.problem`.
 * The classifier picks one of these by name; downstream stages read
 * routing/priority info from `metadata`.
 *
 * @module types/intent
 */

export interface Intent {
  /** Canonical intent name. */
  readonly name: string;

  /** One-line description used in the classifier prompt. */
  readonly description: string;

  /** Example utterances that anchor the classifier. */
  readonly examples?: readonly string[];

  /**
   * Domain-specific routing/priority info — opaque to the pipeline.
   * Hospitality might store `{ department, priority, requiresIdentity }`.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
