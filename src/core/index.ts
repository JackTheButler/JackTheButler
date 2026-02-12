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
// Interfaces (contracts for extensions)
// ============================================
export * from './interfaces/index.js';

// ============================================
// Message Processing
// ============================================
export { MessageProcessor, messageProcessor, getProcessor } from './message-processor.js';

// ============================================
// Escalation Engine
// ============================================
export {
  EscalationManager,
  getEscalationManager,
  resetEscalationManager,
  type EscalationDecision,
  type EscalationConfig,
} from './escalation-engine.js';

// ============================================
// Guest Context
// ============================================
export {
  GuestContextService,
  guestContextService,
  type GuestContext,
} from './guest-context.js';

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
} from './conversation-fsm.js';

// ============================================
// Task Router
// ============================================
export {
  TaskRouter,
  getTaskRouter,
  resetTaskRouter,
  type GuestContext as TaskRouterGuestContext,
  type RoutingDecision,
  type TaskCreationResult,
  type TaskPriority as RouterTaskPriority,
  type TaskSource,
} from './task-router.js';

// ============================================
// Permissions
// ============================================
export {
  PERMISSIONS,
  WILDCARD_PERMISSION,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getAllPermissions,
  type Permission,
  type Role,
  type RoleWithStats,
  type CreateRoleInput,
  type UpdateRoleInput,
  type PermissionDefinition,
  type PermissionGroup,
} from './permissions/index.js';

export {
  DEFAULT_ROLES,
  SYSTEM_ROLE_IDS,
  getDefaultPermissionsForRole,
  isSystemRole,
  getSystemRoleIds,
  expandPermissions,
} from './permissions/defaults.js';
