/**
 * Protected Route Component
 *
 * Wraps routes that require specific permissions.
 * Redirects to Access Denied page if user lacks required permission.
 *
 * @example
 * <Route
 *   path="/tasks"
 *   element={
 *     <ProtectedRoute permission="tasks:view">
 *       <TasksPage />
 *     </ProtectedRoute>
 *   }
 * />
 */

import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

interface ProtectedRouteProps {
  /** Single permission required to access */
  permission?: string;
  /** Multiple permissions - user needs ANY of these */
  permissions?: string[];
  /** If true, requires ALL permissions instead of ANY */
  requireAll?: boolean;
  /** The protected content */
  children: ReactNode;
  /** Custom redirect path (default: /access-denied) */
  redirectTo?: string;
}

export function ProtectedRoute({
  permission,
  permissions,
  requireAll = false,
  children,
  redirectTo = '/access-denied',
}: ProtectedRouteProps) {
  const { can, canAny, canAll } = usePermissions();

  // Single permission check
  if (permission) {
    if (!can(permission)) {
      return <Navigate to={redirectTo} replace />;
    }
    return <>{children}</>;
  }

  // Multiple permissions check
  if (permissions && permissions.length > 0) {
    const hasAccess = requireAll ? canAll(permissions) : canAny(permissions);
    if (!hasAccess) {
      return <Navigate to={redirectTo} replace />;
    }
    return <>{children}</>;
  }

  // No permission specified - allow access
  return <>{children}</>;
}
