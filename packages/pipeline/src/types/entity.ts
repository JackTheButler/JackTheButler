/**
 * Entity — the domain's notion of a user.
 *
 * Intentionally minimal. The pipeline only reads `id` (for memory scoping
 * and conversation linkage). Anything richer (name, language, loyalty,
 * reservation, account state, …) is **domain-specific** and lives on the
 * consumer's extended type:
 *
 * ```typescript
 * interface HospitalityEntity extends Entity {
 *   firstName: string;
 *   reservation?: Reservation;
 *   // ...
 * }
 * ```
 *
 * The consumer's `PromptProvider` reads the extended fields when building
 * the system prompt. The pipeline itself never looks past `id`.
 *
 * @module types/entity
 */

export interface Entity {
  /** Stable identifier used to scope per-entity data (memory, conversation linkage). */
  readonly id: string;
}
