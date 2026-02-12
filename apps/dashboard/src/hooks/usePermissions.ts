/**
 * Permission Hooks
 *
 * Convenient hooks for checking user permissions in components.
 *
 * @module hooks/usePermissions
 */

import { useAuth } from './useAuth';

/**
 * Permission constants matching backend PERMISSIONS
 * Import these for type-safe permission checks
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

  // Knowledge Base
  KNOWLEDGE_VIEW: 'knowledge:view',
  KNOWLEDGE_MANAGE: 'knowledge:manage',

  // Automations
  AUTOMATIONS_VIEW: 'automations:view',
  AUTOMATIONS_MANAGE: 'automations:manage',

  // Settings
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',

  // Admin (users, roles)
  ADMIN_VIEW: 'admin:view',
  ADMIN_MANAGE: 'admin:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Permission utilities returned by usePermissions hook
 */
interface PermissionUtils {
  /**
   * Check if user has a specific permission
   * @param permission - Permission to check (e.g., 'conversations:view')
   * @returns true if user has the permission
   *
   * @example
   * const { can } = usePermissions();
   * if (can('tasks:manage')) {
   *   // Show create task button
   * }
   */
  can: (permission: string) => boolean;

  /**
   * Check if user has any of the specified permissions
   * @param permissions - Array of permissions to check
   * @returns true if user has at least one permission
   *
   * @example
   * const { canAny } = usePermissions();
   * if (canAny(['tasks:view', 'tasks:manage'])) {
   *   // Show tasks menu item
   * }
   */
  canAny: (permissions: string[]) => boolean;

  /**
   * Check if user has all of the specified permissions
   * @param permissions - Array of permissions to check
   * @returns true if user has all permissions
   *
   * @example
   * const { canAll } = usePermissions();
   * if (canAll(['settings:view', 'settings:manage'])) {
   *   // Show full settings access
   * }
   */
  canAll: (permissions: string[]) => boolean;

  /**
   * User's permissions array
   */
  permissions: string[];

  /**
   * Whether permissions have been loaded
   */
  isLoaded: boolean;

  /**
   * User's role name (e.g., 'Admin', 'Staff')
   */
  roleName: string | null;

  /**
   * Whether user is an admin (has wildcard permission)
   */
  isAdmin: boolean;
}

/**
 * Hook for checking user permissions in components
 *
 * @returns Permission utilities
 *
 * @example
 * function TasksPage() {
 *   const { can, canAny, isAdmin } = usePermissions();
 *
 *   // Hide create button if no manage permission
 *   const canCreate = can(PERMISSIONS.TASKS_MANAGE);
 *
 *   // Show page if user has any task permission
 *   const canViewPage = canAny([PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE]);
 *
 *   return (
 *     <div>
 *       {canViewPage && <TaskList />}
 *       {canCreate && <CreateTaskButton />}
 *       {isAdmin && <AdminOnlyFeature />}
 *     </div>
 *   );
 * }
 */
export function usePermissions(): PermissionUtils {
  const { user, hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = useAuth();

  const permissions = user?.permissions ?? [];
  const isAdmin = permissions.includes('*');

  return {
    can: hasPermission,
    canAny: hasAnyPermission,
    canAll: hasAllPermissions,
    permissions,
    isLoaded: !isLoading && user !== null,
    roleName: user?.role?.name ?? null,
    isAdmin,
  };
}

/**
 * Hook that returns true/false for a single permission check
 * Useful for conditional rendering
 *
 * @param permission - Permission to check
 * @returns boolean indicating if user has the permission
 *
 * @example
 * function ConversationReplyInput() {
 *   const canReply = useCan(PERMISSIONS.CONVERSATIONS_MANAGE);
 *   if (!canReply) return null;
 *   return <ReplyInput />;
 * }
 */
export function useCan(permission: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}

/**
 * Hook that returns true if user has any of the specified permissions
 *
 * @param permissions - Array of permissions to check
 * @returns boolean indicating if user has any permission
 *
 * @example
 * const canAccessSettings = useCanAny([PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_MANAGE]);
 */
export function useCanAny(permissions: string[]): boolean {
  const { hasAnyPermission } = useAuth();
  return hasAnyPermission(permissions);
}

/**
 * Hook that returns true if user has all of the specified permissions
 *
 * @param permissions - Array of permissions to check
 * @returns boolean indicating if user has all permissions
 *
 * @example
 * const hasFullAccess = useCanAll([PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE]);
 */
export function useCanAll(permissions: string[]): boolean {
  const { hasAllPermissions } = useAuth();
  return hasAllPermissions(permissions);
}
