/**
 * Shared Permission Constants
 *
 * Single source of truth for permission strings used by both backend and dashboard.
 * Format: resource:action
 */

export const PERMISSIONS = {
  // Conversations
  CONVERSATIONS_VIEW: 'conversations:view',
  CONVERSATIONS_MANAGE: 'conversations:manage',

  // Guests
  GUESTS_VIEW: 'guests:view',
  GUESTS_MANAGE: 'guests:manage',

  // Reservations
  RESERVATIONS_VIEW: 'reservations:view',
  RESERVATIONS_MANAGE: 'reservations:manage',

  // Tasks
  TASKS_VIEW: 'tasks:view',
  TASKS_MANAGE: 'tasks:manage',

  // Approvals
  APPROVALS_VIEW: 'approvals:view',
  APPROVALS_MANAGE: 'approvals:manage',

  // Knowledge
  KNOWLEDGE_VIEW: 'knowledge:view',
  KNOWLEDGE_MANAGE: 'knowledge:manage',

  // Automations
  AUTOMATIONS_VIEW: 'automations:view',
  AUTOMATIONS_MANAGE: 'automations:manage',

  // Settings & Apps
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',

  // Administration (users, roles, audit)
  ADMIN_VIEW: 'admin:view',
  ADMIN_MANAGE: 'admin:manage',

  // System Health
  HEALTH_VIEW: 'health:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Special permission that grants all access */
export const WILDCARD_PERMISSION = '*';
