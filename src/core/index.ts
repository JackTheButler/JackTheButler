/**
 * Core Module
 *
 * The kernel - business logic independent of external adapters.
 * This module contains the core hospitality AI logic that doesn't
 * depend on specific channel implementations or external services.
 *
 * Architecture:
 * - src/core/ contains business logic (kernel)
 * - src/extensions/ contains adapters (channel, AI, PMS implementations)
 *
 * @module core
 * @see docs/03-architecture/decisions/006-extension-architecture.md
 */

// ============================================
// Escalation Engine
// ============================================
export {
  EscalationManager,
  getEscalationManager,
  resetEscalationManager,
  type EscalationDecision,
  type EscalationConfig,
} from './conversation/escalation.js';

// ============================================
// Guest Context
// ============================================
export {
  GuestContextService,
  guestContextService,
  type GuestContext,
} from './conversation/guest-context.js';

// ============================================
// Conversation State Machine
// ============================================
export {
  ConversationFSM,
  mapDbStateToFSM,
  mapFSMToDbState,
  type ConversationState,
  type ConversationEvent,
  type TransitionResult,
} from './conversation/fsm.js';
