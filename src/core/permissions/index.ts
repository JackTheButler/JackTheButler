/**
 * Permission System
 *
 * Role-based access control with granular permissions.
 * Permissions follow a simple view/manage pattern per resource.
 */

import type { PermissionDefinition, PermissionGroup } from './types.js';

/**
 * All available permissions in the system.
 * Format: resource:action (view or manage)
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
} as const;

/**
 * Permission key type - union of all permission values
 */
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Special permission that grants all access
 */
export const WILDCARD_PERMISSION = '*';

/**
 * Permission definitions with metadata for UI display
 */
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Conversations
  {
    key: PERMISSIONS.CONVERSATIONS_VIEW,
    label: 'View Conversations',
    description: 'View guest conversations and chat history',
    group: 'conversations',
  },
  {
    key: PERMISSIONS.CONVERSATIONS_MANAGE,
    label: 'Manage Conversations',
    description: 'Reply to conversations, transfer, close threads',
    group: 'conversations',
  },

  // Guests
  {
    key: PERMISSIONS.GUESTS_VIEW,
    label: 'View Guests',
    description: 'View guest profiles and contact information',
    group: 'guests',
  },
  {
    key: PERMISSIONS.GUESTS_MANAGE,
    label: 'Manage Guests',
    description: 'Edit guest profiles, merge duplicates, delete guests',
    group: 'guests',
  },

  // Reservations
  {
    key: PERMISSIONS.RESERVATIONS_VIEW,
    label: 'View Reservations',
    description: 'View reservation details and history',
    group: 'reservations',
  },
  {
    key: PERMISSIONS.RESERVATIONS_MANAGE,
    label: 'Manage Reservations',
    description: 'Create, edit, and cancel reservations',
    group: 'reservations',
  },

  // Tasks
  {
    key: PERMISSIONS.TASKS_VIEW,
    label: 'View Tasks',
    description: 'View task list and task details',
    group: 'tasks',
  },
  {
    key: PERMISSIONS.TASKS_MANAGE,
    label: 'Manage Tasks',
    description: 'Create, assign, complete, and delete tasks',
    group: 'tasks',
  },

  // Approvals
  {
    key: PERMISSIONS.APPROVALS_VIEW,
    label: 'View Approvals',
    description: 'View pending approval requests',
    group: 'approvals',
  },
  {
    key: PERMISSIONS.APPROVALS_MANAGE,
    label: 'Manage Approvals',
    description: 'Approve or reject pending requests',
    group: 'approvals',
  },

  // Knowledge
  {
    key: PERMISSIONS.KNOWLEDGE_VIEW,
    label: 'View Knowledge',
    description: 'View knowledge base entries',
    group: 'knowledge',
  },
  {
    key: PERMISSIONS.KNOWLEDGE_MANAGE,
    label: 'Manage Knowledge',
    description: 'Add, edit, and delete knowledge entries',
    group: 'knowledge',
  },

  // Automations
  {
    key: PERMISSIONS.AUTOMATIONS_VIEW,
    label: 'View Automations',
    description: 'View automation rules and AI autonomy settings',
    group: 'automations',
  },
  {
    key: PERMISSIONS.AUTOMATIONS_MANAGE,
    label: 'Manage Automations',
    description: 'Configure automation rules and AI behavior',
    group: 'automations',
  },

  // Settings & Apps
  {
    key: PERMISSIONS.SETTINGS_VIEW,
    label: 'View Settings',
    description: 'View hotel settings and app configurations',
    group: 'settings',
  },
  {
    key: PERMISSIONS.SETTINGS_MANAGE,
    label: 'Manage Settings',
    description: 'Configure hotel settings and manage apps',
    group: 'settings',
  },

  // Administration
  {
    key: PERMISSIONS.ADMIN_VIEW,
    label: 'View Administration',
    description: 'View users, roles, and audit logs',
    group: 'admin',
  },
  {
    key: PERMISSIONS.ADMIN_MANAGE,
    label: 'Manage Administration',
    description: 'Manage users, roles, and system settings',
    group: 'admin',
  },
];

/**
 * Permission groups for organized UI display
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'conversations',
    label: 'Conversations',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'conversations'),
  },
  {
    key: 'guests',
    label: 'Guests',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'guests'),
  },
  {
    key: 'reservations',
    label: 'Reservations',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'reservations'),
  },
  {
    key: 'tasks',
    label: 'Tasks',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'tasks'),
  },
  {
    key: 'approvals',
    label: 'Approvals',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'approvals'),
  },
  {
    key: 'knowledge',
    label: 'Knowledge Base',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'knowledge'),
  },
  {
    key: 'automations',
    label: 'Automations',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'automations'),
  },
  {
    key: 'settings',
    label: 'Settings & Apps',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'settings'),
  },
  {
    key: 'admin',
    label: 'Administration',
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.group === 'admin'),
  },
];

/**
 * Check if user has a specific permission
 * @param userPermissions - Array of user's permissions (or ['*'] for all)
 * @param required - The permission to check
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes(WILDCARD_PERMISSION)) {
    return true;
  }
  return userPermissions.includes(required);
}

/**
 * Check if user has any of the specified permissions
 * @param userPermissions - Array of user's permissions (or ['*'] for all)
 * @param required - Array of permissions to check (user needs at least one)
 */
export function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  if (userPermissions.includes(WILDCARD_PERMISSION)) {
    return true;
  }
  return required.some((perm) => userPermissions.includes(perm));
}

/**
 * Check if user has all of the specified permissions
 * @param userPermissions - Array of user's permissions (or ['*'] for all)
 * @param required - Array of permissions to check (user needs all)
 */
export function hasAllPermissions(userPermissions: string[], required: string[]): boolean {
  if (userPermissions.includes(WILDCARD_PERMISSION)) {
    return true;
  }
  return required.every((perm) => userPermissions.includes(perm));
}

/**
 * Get all permission keys as an array
 */
export function getAllPermissions(): string[] {
  return Object.values(PERMISSIONS);
}

// Re-export types
export type {
  Role,
  RoleWithStats,
  CreateRoleInput,
  UpdateRoleInput,
  PermissionDefinition,
  PermissionGroup,
} from './types.js';
