/**
 * Business Logic Services
 *
 * Core services that implement business logic:
 * - AuthService - Authentication and token management
 * - ConversationService - Conversation handling (Phase 3)
 * - GuestService - Guest profile management (Phase 5)
 * - TaskService - Task creation and management (Phase 5)
 * - StaffService - Staff management (Phase 6)
 *
 * Services coordinate between the database, AI engine,
 * and integrations to fulfill business requirements.
 */

export { AuthService } from './auth.js';
export { ConversationService, conversationService } from './conversation.js';
