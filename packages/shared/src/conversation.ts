/**
 * Conversation state type — shared between backend and dashboard.
 * Values must match the database schema column: conversations.state
 */
export type ConversationState = 'new' | 'active' | 'escalated' | 'resolved' | 'closed';
