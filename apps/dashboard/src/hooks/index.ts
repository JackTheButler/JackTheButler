/**
 * Hooks Index
 *
 * Re-exports all hooks for convenient imports.
 *
 * @example
 * import { useAuth, usePermissions, useCan } from '@/hooks';
 */

export { useAuth } from './useAuth';
export {
  usePermissions,
  useCan,
  useCanAny,
  useCanAll,
  PERMISSIONS,
  type Permission,
} from './usePermissions';
export { useWebSocket } from './useWebSocket';
export { useFilteredQuery } from './useFilteredQuery';
export { useDismissible } from './useDismissible';
export { useSystemStatus } from './useSystemStatus';
export { useChatFlow } from './useChatFlow';
