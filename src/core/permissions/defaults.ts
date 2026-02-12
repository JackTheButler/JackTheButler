/**
 * Default Roles and Permissions
 *
 * System roles that are created on first run and cannot be deleted.
 */

import { PERMISSIONS, WILDCARD_PERMISSION, getAllPermissions } from './index.js';
import type { Role } from './types.js';

/**
 * System role IDs - these roles cannot be deleted
 */
export const SYSTEM_ROLE_IDS = {
  ADMIN: 'role-admin',
  MANAGER: 'role-manager',
  STAFF: 'role-staff',
  VIEWER: 'role-viewer',
} as const;

/**
 * Default system roles with their permissions
 */
export const DEFAULT_ROLES: Omit<Role, 'createdAt' | 'updatedAt'>[] = [
  {
    id: SYSTEM_ROLE_IDS.ADMIN,
    name: 'Admin',
    description: 'Full system access including user and role management',
    permissions: [WILDCARD_PERMISSION], // All permissions
    isSystem: true,
  },
  {
    id: SYSTEM_ROLE_IDS.MANAGER,
    name: 'Manager',
    description: 'Manage daily operations, staff tasks, and hotel settings',
    permissions: [
      // Full access to operations
      PERMISSIONS.CONVERSATIONS_VIEW,
      PERMISSIONS.CONVERSATIONS_MANAGE,
      PERMISSIONS.GUESTS_VIEW,
      PERMISSIONS.GUESTS_MANAGE,
      PERMISSIONS.RESERVATIONS_VIEW,
      PERMISSIONS.RESERVATIONS_MANAGE,
      PERMISSIONS.TASKS_VIEW,
      PERMISSIONS.TASKS_MANAGE,
      PERMISSIONS.APPROVALS_VIEW,
      PERMISSIONS.APPROVALS_MANAGE,
      PERMISSIONS.KNOWLEDGE_VIEW,
      PERMISSIONS.KNOWLEDGE_MANAGE,
      PERMISSIONS.AUTOMATIONS_VIEW,
      PERMISSIONS.AUTOMATIONS_MANAGE,
      PERMISSIONS.SETTINGS_VIEW,
      PERMISSIONS.SETTINGS_MANAGE,
      // View-only admin (can see users but not manage)
      PERMISSIONS.ADMIN_VIEW,
    ],
    isSystem: true,
  },
  {
    id: SYSTEM_ROLE_IDS.STAFF,
    name: 'Staff',
    description: 'Handle guest requests, tasks, and day-to-day operations',
    permissions: [
      // Core operational permissions
      PERMISSIONS.CONVERSATIONS_VIEW,
      PERMISSIONS.CONVERSATIONS_MANAGE,
      PERMISSIONS.GUESTS_VIEW,
      PERMISSIONS.RESERVATIONS_VIEW,
      PERMISSIONS.TASKS_VIEW,
      PERMISSIONS.TASKS_MANAGE,
      PERMISSIONS.APPROVALS_VIEW,
      PERMISSIONS.KNOWLEDGE_VIEW,
    ],
    isSystem: true,
  },
  {
    id: SYSTEM_ROLE_IDS.VIEWER,
    name: 'Viewer',
    description: 'Read-only access to view operations and reports',
    permissions: [
      // View-only permissions
      PERMISSIONS.CONVERSATIONS_VIEW,
      PERMISSIONS.GUESTS_VIEW,
      PERMISSIONS.RESERVATIONS_VIEW,
      PERMISSIONS.TASKS_VIEW,
      PERMISSIONS.APPROVALS_VIEW,
      PERMISSIONS.KNOWLEDGE_VIEW,
    ],
    isSystem: true,
  },
];

/**
 * Get default permissions for a role by ID
 * @param roleId - The system role ID
 * @returns Array of permission keys, or empty array if not found
 */
export function getDefaultPermissionsForRole(roleId: string): string[] {
  const role = DEFAULT_ROLES.find((r) => r.id === roleId);
  return role?.permissions ?? [];
}

/**
 * Check if a role ID is a system role
 * @param roleId - The role ID to check
 */
export function isSystemRole(roleId: string): boolean {
  return Object.values(SYSTEM_ROLE_IDS).includes(roleId as (typeof SYSTEM_ROLE_IDS)[keyof typeof SYSTEM_ROLE_IDS]);
}

/**
 * Get all system role IDs
 */
export function getSystemRoleIds(): string[] {
  return Object.values(SYSTEM_ROLE_IDS);
}

/**
 * Expand wildcard permission to all permissions
 * @param permissions - Array of permissions (may include '*')
 * @returns Array with wildcard expanded to all permissions
 */
export function expandPermissions(permissions: string[]): string[] {
  if (permissions.includes(WILDCARD_PERMISSION)) {
    return getAllPermissions();
  }
  return permissions;
}
