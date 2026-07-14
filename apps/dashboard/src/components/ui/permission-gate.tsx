/**
 * Permission Gate Component
 *
 * Conditionally renders children based on user permissions.
 * Use this to hide UI elements from users who lack specific permissions.
 *
 * @example
 * <PermissionGate permission="guests:manage">
 *   <CreateGuestButton />
 * </PermissionGate>
 *
 * @example
 * <PermissionGate permissions={["guests:view", "guests:manage"]} requireAll={false}>
 *   <GuestList />
 * </PermissionGate>
 */

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';

interface PermissionGateProps {
  /** Single permission to check */
  permission?: string;
  /** Multiple permissions to check */
  permissions?: string[];
  /** If true, requires all permissions. If false, requires any permission. Default: false */
  requireAll?: boolean;
  /** Content to render if user has permission */
  children: ReactNode;
  /** Optional fallback content if user lacks permission */
  fallback?: ReactNode;
}

export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { can, canAny, canAll } = usePermissions();

  // Single permission check
  if (permission) {
    return can(permission) ? <>{children}</> : <>{fallback}</>;
  }

  // Multiple permissions check
  if (permissions && permissions.length > 0) {
    const hasAccess = requireAll ? canAll(permissions) : canAny(permissions);
    return hasAccess ? <>{children}</> : <>{fallback}</>;
  }

  // No permission specified - render children
  return <>{children}</>;
}
