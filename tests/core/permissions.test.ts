/**
 * Permission System Tests
 */

import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  WILDCARD_PERMISSION,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getAllPermissions,
} from '@/core/permissions/index.js';
import {
  DEFAULT_ROLES,
  SYSTEM_ROLE_IDS,
  getDefaultPermissionsForRole,
  isSystemRole,
  getSystemRoleIds,
  expandPermissions,
} from '@/core/permissions/defaults.js';

describe('Permission Constants', () => {
  it('should have 18 permissions defined', () => {
    const permissions = Object.values(PERMISSIONS);
    expect(permissions).toHaveLength(18);
  });

  it('should have permissions in resource:action format', () => {
    const permissions = Object.values(PERMISSIONS);
    for (const perm of permissions) {
      expect(perm).toMatch(/^[a-z]+:(view|manage)$/);
    }
  });

  it('should have matching permission definitions', () => {
    const permissionKeys = Object.values(PERMISSIONS);
    const definitionKeys = PERMISSION_DEFINITIONS.map((d) => d.key);

    expect(definitionKeys).toHaveLength(permissionKeys.length);
    for (const key of permissionKeys) {
      expect(definitionKeys).toContain(key);
    }
  });

  it('should have all permissions grouped', () => {
    const allGroupedPermissions = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    const permissionKeys = Object.values(PERMISSIONS);

    expect(allGroupedPermissions).toHaveLength(permissionKeys.length);
    for (const key of permissionKeys) {
      expect(allGroupedPermissions).toContain(key);
    }
  });

  it('should have 9 permission groups', () => {
    expect(PERMISSION_GROUPS).toHaveLength(9);
  });
});

describe('hasPermission', () => {
  it('should return true when user has the permission', () => {
    const userPermissions = [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE];
    expect(hasPermission(userPermissions, PERMISSIONS.TASKS_VIEW)).toBe(true);
    expect(hasPermission(userPermissions, PERMISSIONS.TASKS_MANAGE)).toBe(true);
  });

  it('should return false when user lacks the permission', () => {
    const userPermissions = [PERMISSIONS.TASKS_VIEW];
    expect(hasPermission(userPermissions, PERMISSIONS.TASKS_MANAGE)).toBe(false);
    expect(hasPermission(userPermissions, PERMISSIONS.ADMIN_MANAGE)).toBe(false);
  });

  it('should return true for wildcard permission', () => {
    const userPermissions = [WILDCARD_PERMISSION];
    expect(hasPermission(userPermissions, PERMISSIONS.TASKS_VIEW)).toBe(true);
    expect(hasPermission(userPermissions, PERMISSIONS.ADMIN_MANAGE)).toBe(true);
    expect(hasPermission(userPermissions, 'any:permission')).toBe(true);
  });

  it('should return false for empty permissions', () => {
    expect(hasPermission([], PERMISSIONS.TASKS_VIEW)).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('should return true when user has any of the permissions', () => {
    const userPermissions = [PERMISSIONS.TASKS_VIEW];
    expect(hasAnyPermission(userPermissions, [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE])).toBe(true);
  });

  it('should return false when user has none of the permissions', () => {
    const userPermissions = [PERMISSIONS.GUESTS_VIEW];
    expect(hasAnyPermission(userPermissions, [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE])).toBe(false);
  });

  it('should return true for wildcard permission', () => {
    const userPermissions = [WILDCARD_PERMISSION];
    expect(hasAnyPermission(userPermissions, [PERMISSIONS.TASKS_VIEW, PERMISSIONS.ADMIN_MANAGE])).toBe(true);
  });

  it('should return false for empty required permissions', () => {
    const userPermissions = [PERMISSIONS.TASKS_VIEW];
    expect(hasAnyPermission(userPermissions, [])).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  it('should return true when user has all permissions', () => {
    const userPermissions = [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE, PERMISSIONS.GUESTS_VIEW];
    expect(hasAllPermissions(userPermissions, [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE])).toBe(true);
  });

  it('should return false when user lacks any permission', () => {
    const userPermissions = [PERMISSIONS.TASKS_VIEW];
    expect(hasAllPermissions(userPermissions, [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE])).toBe(false);
  });

  it('should return true for wildcard permission', () => {
    const userPermissions = [WILDCARD_PERMISSION];
    expect(hasAllPermissions(userPermissions, [PERMISSIONS.TASKS_VIEW, PERMISSIONS.ADMIN_MANAGE])).toBe(true);
  });

  it('should return true for empty required permissions', () => {
    const userPermissions = [PERMISSIONS.TASKS_VIEW];
    expect(hasAllPermissions(userPermissions, [])).toBe(true);
  });
});

describe('getAllPermissions', () => {
  it('should return all permission keys', () => {
    const all = getAllPermissions();
    expect(all).toHaveLength(18);
    expect(all).toContain(PERMISSIONS.CONVERSATIONS_VIEW);
    expect(all).toContain(PERMISSIONS.ADMIN_MANAGE);
  });
});

describe('Default Roles', () => {
  it('should have 4 default roles', () => {
    expect(DEFAULT_ROLES).toHaveLength(4);
  });

  it('should have Admin, Manager, Staff, Viewer roles', () => {
    const roleNames = DEFAULT_ROLES.map((r) => r.name);
    expect(roleNames).toContain('Admin');
    expect(roleNames).toContain('Manager');
    expect(roleNames).toContain('Staff');
    expect(roleNames).toContain('Viewer');
  });

  it('should mark all default roles as system roles', () => {
    for (const role of DEFAULT_ROLES) {
      expect(role.isSystem).toBe(true);
    }
  });

  it('should give Admin wildcard permission', () => {
    const adminRole = DEFAULT_ROLES.find((r) => r.id === SYSTEM_ROLE_IDS.ADMIN);
    expect(adminRole?.permissions).toContain(WILDCARD_PERMISSION);
  });

  it('should not give non-admin roles wildcard permission', () => {
    const nonAdminRoles = DEFAULT_ROLES.filter((r) => r.id !== SYSTEM_ROLE_IDS.ADMIN);
    for (const role of nonAdminRoles) {
      expect(role.permissions).not.toContain(WILDCARD_PERMISSION);
    }
  });
});

describe('getDefaultPermissionsForRole', () => {
  it('should return permissions for Admin role', () => {
    const permissions = getDefaultPermissionsForRole(SYSTEM_ROLE_IDS.ADMIN);
    expect(permissions).toContain(WILDCARD_PERMISSION);
  });

  it('should return permissions for Staff role', () => {
    const permissions = getDefaultPermissionsForRole(SYSTEM_ROLE_IDS.STAFF);
    expect(permissions).toContain(PERMISSIONS.CONVERSATIONS_VIEW);
    expect(permissions).toContain(PERMISSIONS.TASKS_MANAGE);
    expect(permissions).not.toContain(PERMISSIONS.ADMIN_MANAGE);
  });

  it('should return empty array for unknown role', () => {
    const permissions = getDefaultPermissionsForRole('unknown-role');
    expect(permissions).toEqual([]);
  });
});

describe('isSystemRole', () => {
  it('should return true for system role IDs', () => {
    expect(isSystemRole(SYSTEM_ROLE_IDS.ADMIN)).toBe(true);
    expect(isSystemRole(SYSTEM_ROLE_IDS.MANAGER)).toBe(true);
    expect(isSystemRole(SYSTEM_ROLE_IDS.STAFF)).toBe(true);
    expect(isSystemRole(SYSTEM_ROLE_IDS.VIEWER)).toBe(true);
  });

  it('should return false for custom role IDs', () => {
    expect(isSystemRole('role-custom')).toBe(false);
    expect(isSystemRole('unknown')).toBe(false);
  });
});

describe('getSystemRoleIds', () => {
  it('should return all system role IDs', () => {
    const ids = getSystemRoleIds();
    expect(ids).toHaveLength(4);
    expect(ids).toContain(SYSTEM_ROLE_IDS.ADMIN);
    expect(ids).toContain(SYSTEM_ROLE_IDS.MANAGER);
    expect(ids).toContain(SYSTEM_ROLE_IDS.STAFF);
    expect(ids).toContain(SYSTEM_ROLE_IDS.VIEWER);
  });
});

describe('expandPermissions', () => {
  it('should expand wildcard to all permissions', () => {
    const expanded = expandPermissions([WILDCARD_PERMISSION]);
    expect(expanded).toHaveLength(18);
    expect(expanded).toContain(PERMISSIONS.CONVERSATIONS_VIEW);
    expect(expanded).toContain(PERMISSIONS.ADMIN_MANAGE);
  });

  it('should return permissions as-is when no wildcard', () => {
    const permissions = [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE];
    const expanded = expandPermissions(permissions);
    expect(expanded).toEqual(permissions);
  });
});
