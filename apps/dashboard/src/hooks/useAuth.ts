import { create } from 'zustand';
import { api } from '@/lib/api';

/**
 * User role information
 */
interface UserRole {
  id: string;
  name: string;
}

/**
 * Authenticated user information
 */
interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: string[];
}

/**
 * Raw user response from API
 */
interface UserResponse {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

/**
 * Auth state and actions
 */
interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  // Permission helpers
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

/**
 * Wildcard permission that grants all access
 */
const WILDCARD_PERMISSION = '*';

/**
 * Transform API response to User object
 */
function transformUser(response: UserResponse): User {
  return {
    id: response.id,
    email: response.email,
    name: response.name,
    role: {
      id: response.roleId,
      name: response.roleName,
    },
    permissions: response.permissions,
  };
}

/**
 * Check if user has a specific permission
 */
function checkPermission(permissions: string[], permission: string): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }
  // Wildcard grants all permissions
  if (permissions.includes(WILDCARD_PERMISSION)) {
    return true;
  }
  return permissions.includes(permission);
}

/**
 * Check if user has any of the specified permissions
 */
function checkAnyPermission(permissions: string[], required: string[]): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }
  // Wildcard grants all permissions
  if (permissions.includes(WILDCARD_PERMISSION)) {
    return true;
  }
  return required.some((p) => permissions.includes(p));
}

/**
 * Check if user has all of the specified permissions
 */
function checkAllPermissions(permissions: string[], required: string[]): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }
  // Wildcard grants all permissions
  if (permissions.includes(WILDCARD_PERMISSION)) {
    return true;
  }
  return required.every((p) => permissions.includes(p));
}

/**
 * Auth store using Zustand
 */
export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string, rememberMe = false) => {
    // Set storage preference before storing tokens
    api.setRememberMe(rememberMe);

    const data = await api.post<{ accessToken: string; refreshToken: string }>('/auth/login', {
      email,
      password,
      rememberMe,
    });
    api.setToken(data.accessToken);
    api.setRefreshToken(data.refreshToken);

    const { user: userResponse } = await api.get<{ user: UserResponse }>('/auth/me');
    const user = transformUser(userResponse);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    api.setRememberMe(false);
    api.setToken(null);
    api.setRefreshToken(null);
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = api.getToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      // This will auto-refresh if token expired
      const { user: userResponse } = await api.get<{ user: UserResponse }>('/auth/me');
      const user = transformUser(userResponse);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      api.setToken(null);
      api.setRefreshToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  // Permission helpers that use current state
  hasPermission: (permission: string) => {
    const { user } = get();
    return user ? checkPermission(user.permissions, permission) : false;
  },

  hasAnyPermission: (permissions: string[]) => {
    const { user } = get();
    return user ? checkAnyPermission(user.permissions, permissions) : false;
  },

  hasAllPermissions: (permissions: string[]) => {
    const { user } = get();
    return user ? checkAllPermissions(user.permissions, permissions) : false;
  },
}));
