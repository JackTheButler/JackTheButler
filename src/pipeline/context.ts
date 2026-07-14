/**
 * Butler-specific extensions to the `@thebutler/pipeline` message context.
 *
 * Pure domain type — no dependency on the app registry or any other
 * assembly-layer concern, so it can be imported by both the domain pieces
 * in `src/pipeline/`.
 *
 * @module pipeline/context
 */

import type { MessageContext } from '@thebutler/pipeline';
import type { VerificationState } from '@/services/verification.js';

/**
 * Butler-specific extensions to `MessageContext`.
 *
 * Fields are added as the stage-by-stage review surfaces Butler-specific
 * state that needs to flow between stages.
 */
export interface ButlerContext extends MessageContext {
  /**
   * Hospitality identity-verification state for the current turn. Written
   * by the Butler-side `checkVerification` stage and read by the responder
   * to phrase its reply (success / partial / failed / max-attempts).
   */
  verification?: VerificationState;
}
