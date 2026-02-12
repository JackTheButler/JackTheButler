/**
 * Permission System Types
 *
 * Type definitions for the role-based access control system.
 */

/**
 * Role stored in database
 */
export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[]; // Array of permission keys, or ['*'] for all
  isSystem: boolean; // true = built-in role, cannot be deleted
  createdAt: string;
  updatedAt: string;
}

/**
 * Role with additional computed fields
 */
export interface RoleWithStats extends Role {
  userCount: number;
}

/**
 * Input for creating a new role
 */
export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

/**
 * Input for updating a role
 */
export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

/**
 * Permission definition with metadata
 */
export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  group: string;
}

/**
 * Group of related permissions for UI display
 */
export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionDefinition[];
}
