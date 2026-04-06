/**
 * Conversation State Machine
 *
 * Explicit finite state machine for conversation lifecycle management.
 * Defines valid state transitions and enforces business rules.
 *
 * Part of the kernel - this is core business logic for conversation management.
 *
 * @module core/conversation/fsm
 */

import { createLogger } from '@/utils/logger.js';

const log = createLogger('core:conversation-fsm');

/**
 * Valid conversation states
 */
export type ConversationState =
  | 'new' // Just created, no messages yet
  | 'active' // AI is handling the conversation
  | 'waiting' // Waiting for guest response
  | 'escalated' // Handed off to human staff
  | 'resolved' // Issue resolved, conversation ending
  | 'closed'; // Conversation archived

/**
 * Events that trigger state transitions
 */
export type ConversationEvent =
  | 'message_received' // Guest sent a message
  | 'response_sent' // AI/staff sent a response
  | 'escalation_triggered' // Escalation criteria met
  | 'staff_assigned' // Staff member took over
  | 'staff_resolved' // Staff marked as resolved
  | 'guest_satisfied' // Guest confirmed resolution
  | 'timeout' // Inactivity timeout
  | 'reopen'; // Guest sent new message after resolved

/**
 * Transition result
 */
export interface TransitionResult {
  success: boolean;
  newState: ConversationState;
  reason?: string;
}

/**
 * State transition definition
 */
interface StateTransition {
  from: ConversationState;
  event: ConversationEvent;
  to: ConversationState;
  guard?: () => boolean;
}

/**
 * Define all valid state transitions
 */
const TRANSITIONS: StateTransition[] = [
  // From 'new'
  { from: 'new', event: 'message_received', to: 'active' },

  // From 'active'
  { from: 'active', event: 'response_sent', to: 'waiting' },
  { from: 'active', event: 'escalation_triggered', to: 'escalated' },
  { from: 'active', event: 'guest_satisfied', to: 'resolved' },
  { from: 'active', event: 'timeout', to: 'closed' },

  // From 'waiting'
  { from: 'waiting', event: 'message_received', to: 'active' },
  { from: 'waiting', event: 'escalation_triggered', to: 'escalated' },
  { from: 'waiting', event: 'timeout', to: 'closed' },

  // From 'escalated'
  { from: 'escalated', event: 'staff_assigned', to: 'escalated' }, // Stay escalated
  { from: 'escalated', event: 'message_received', to: 'escalated' }, // Stay escalated
  { from: 'escalated', event: 'response_sent', to: 'escalated' }, // Stay escalated
  { from: 'escalated', event: 'staff_resolved', to: 'resolved' },
  { from: 'escalated', event: 'timeout', to: 'closed' },

  // From 'resolved'
  { from: 'resolved', event: 'reopen', to: 'active' },
  { from: 'resolved', event: 'message_received', to: 'active' }, // Implicit reopen
  { from: 'resolved', event: 'timeout', to: 'closed' },
  { from: 'resolved', event: 'guest_satisfied', to: 'closed' }, // Explicit close

  // From 'closed' - generally no transitions out, but allow reopen
  { from: 'closed', event: 'reopen', to: 'active' },
  { from: 'closed', event: 'message_received', to: 'active' }, // New message reopens
];

/**
 * Conversation Finite State Machine
 *
 * Manages conversation state transitions with explicit rules.
 */
export class ConversationFSM {
  private currentState: ConversationState;
  private readonly conversationId: string;

  constructor(conversationId: string, initialState: ConversationState = 'new') {
    this.conversationId = conversationId;
    this.currentState = initialState;
  }

  /**
   * Get current state
   */
  getState(): ConversationState {
    return this.currentState;
  }

  /**
   * Attempt a state transition
   */
  transition(event: ConversationEvent): TransitionResult {
    const validTransition = TRANSITIONS.find(
      (t) => t.from === this.currentState && t.event === event
    );

    if (!validTransition) {
      log.warn(
        {
          conversationId: this.conversationId,
          currentState: this.currentState,
          event,
        },
        'Invalid state transition attempted'
      );

      return {
        success: false,
        newState: this.currentState,
        reason: `Cannot transition from '${this.currentState}' on event '${event}'`,
      };
    }

    // Check guard condition if present
    if (validTransition.guard && !validTransition.guard()) {
      return {
        success: false,
        newState: this.currentState,
        reason: 'Transition guard condition not met',
      };
    }

    const previousState = this.currentState;
    this.currentState = validTransition.to;

    log.info(
      {
        conversationId: this.conversationId,
        previousState,
        event,
        newState: this.currentState,
      },
      'Conversation state transitioned'
    );

    return {
      success: true,
      newState: this.currentState,
    };
  }

  /**
   * Check if a transition is valid without performing it
   */
  canTransition(event: ConversationEvent): boolean {
    return TRANSITIONS.some((t) => t.from === this.currentState && t.event === event);
  }

  /**
   * Check if transition from one state to another is valid
   */
  static canTransitionBetween(from: ConversationState, to: ConversationState): boolean {
    return TRANSITIONS.some((t) => t.from === from && t.to === to);
  }

  /**
   * Get all valid events for current state
   */
  getValidEvents(): ConversationEvent[] {
    return TRANSITIONS.filter((t) => t.from === this.currentState).map((t) => t.event);
  }

  /**
   * Get all possible next states from current state
   */
  getPossibleNextStates(): ConversationState[] {
    const states = TRANSITIONS.filter((t) => t.from === this.currentState).map((t) => t.to);
    return [...new Set(states)]; // Remove duplicates
  }

  /**
   * Check if conversation is in a terminal state
   */
  isTerminal(): boolean {
    return this.currentState === 'closed';
  }

  /**
   * Check if conversation requires staff attention
   */
  requiresStaffAttention(): boolean {
    return this.currentState === 'escalated';
  }

  /**
   * Check if conversation is active (AI or staff handling)
   */
  isActive(): boolean {
    return ['active', 'waiting', 'escalated'].includes(this.currentState);
  }
}

/**
 * Map database state strings to FSM states
 */
export function mapDbStateToFSM(dbState: string | null): ConversationState {
  const stateMap: Record<string, ConversationState> = {
    new: 'new',
    active: 'active',
    waiting: 'waiting',
    escalated: 'escalated',
    resolved: 'resolved',
    closed: 'closed',
    // Legacy mappings
    open: 'active',
    pending: 'waiting',
  };

  return stateMap[dbState || 'new'] || 'new';
}

/**
 * Map FSM states to database state strings
 */
export function mapFSMToDbState(fsmState: ConversationState): string {
  return fsmState;
}
