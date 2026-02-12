# User & Role Management

> Phase: In Progress
> Status: Phase 9K Complete
> Priority: High

## Overview

Implement a permission-based role system for managing staff access. Roles are configurable with granular permissions, allowing admins to create custom roles tailored to their property's needs.

## Goals

1. **Granular Access Control** - Control who can access what features
2. **Configurable Roles** - Create custom roles with specific permissions
3. **Simple Default Roles** - Pre-configured Admin, Manager, Staff, Viewer roles
4. **API Protection** - All endpoints enforce permissions
5. **UI Enforcement** - Disable menu items and hide action buttons based on permissions

## Data Model

### Permissions (Hardcoded)

Permissions are defined in code and map to actual features:

```typescript
const PERMISSIONS = {
  // Conversations
  'conversations.view': 'View conversations and messages',
  'conversations.respond': 'Reply to guests and take over from AI',

  // Guests
  'guests.view': 'View guest profiles and history',
  'guests.manage': 'Edit guest information',

  // Reservations
  'reservations.view': 'View reservations',
  'reservations.manage': 'Edit reservation details',

  // Tasks
  'tasks.view': 'View task list',
  'tasks.manage': 'Create, assign, and complete tasks',

  // Approvals (autonomy L1 queue)
  'approvals.view': 'View pending approvals',
  'approvals.manage': 'Approve or reject AI actions',

  // Knowledge Base
  'knowledge.view': 'View knowledge base',
  'knowledge.manage': 'Add, edit, and delete knowledge',

  // Automations
  'automations.view': 'View automation rules',
  'automations.manage': 'Create and edit automations',

  // Settings & Apps
  'settings.view': 'View settings',
  'settings.manage': 'Change hotel profile and preferences',
  'apps.manage': 'Install and configure integrations',

  // Audit Log (read-only, sensitive)
  'audit.view': 'View audit log',

  // User Management
  'users.view': 'View staff list',
  'users.manage': 'Create, edit, and deactivate staff',
  'roles.manage': 'Create and edit roles',
} as const

// Total: 18 permissions
```

### Roles Table (New)

```sql
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT NOT NULL DEFAULT '[]',  -- JSON array of permission keys
  is_system INTEGER NOT NULL DEFAULT 0,    -- 1 = can't delete (built-in roles)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_roles_name ON roles(name);
```

### Staff Table Changes

```sql
-- Change: role TEXT → role_id TEXT (FK to roles)
-- Keep: permissions JSON for per-user overrides (future)

ALTER TABLE staff ADD COLUMN role_id TEXT REFERENCES roles(id);
-- Migrate existing role strings to role_id
-- Drop old role column after migration
```

### Default Roles (Seeded)

| Role | Permissions | System |
|------|-------------|--------|
| **Admin** | `*` (all permissions) | Yes |
| **Manager** | All except `users.manage`, `roles.manage` | Yes |
| **Staff** | `conversations.*`, `tasks.*`, `guests.view`, `reservations.view`, `knowledge.view`, `approvals.*` | Yes |
| **Viewer** | All `.view` permissions only | Yes |

---

## Implementation Phases

### Phase 9A: Permissions & Core Structure ✅

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Define permissions and create core types/utilities.

#### Tasks

- [x] Create `src/core/permissions/index.ts`
  - `PERMISSIONS` constant with all 18 permissions
  - `Permission` type (union of permission keys)
  - `PermissionGroup` type for UI grouping
  - `PERMISSION_GROUPS` for organized display
  - `hasPermission(userPermissions, required)` utility
  - `hasAnyPermission(userPermissions, required[])` utility
  - `getAllPermissions()` helper

- [x] Create `src/core/permissions/types.ts`
  - `Role` interface
  - `RoleWithPermissions` interface
  - `CreateRoleInput`, `UpdateRoleInput` types

- [x] Create `src/core/permissions/defaults.ts`
  - `DEFAULT_ROLES` array with Admin, Manager, Staff, Viewer
  - `getDefaultPermissionsForRole(roleName)` helper

#### Verification

- [x] `pnpm typecheck` passes
- [x] Unit tests for permission utilities (`tests/core/permissions.test.ts` - 31 tests)
- [x] Export from `src/core/index.ts`

---

### Phase 9B: Database Migration ✅

> **Effort:** 0.5 day | **Risk:** Medium | **Breaking Changes:** Migration required

**Goal:** Add roles table and migrate staff.role to staff.roleId.

#### Tasks

- [x] Add `roles` table to `src/db/schema.ts`
  - id, name, description, permissions (JSON), isSystem, timestamps

- [x] Modify `staff` table in schema
  - Add `roleId` column (NOT NULL, FK to roles)
  - Remove legacy `role` column

- [x] Create migration (via Drizzle generate)
  - Create roles table
  - Seed default roles (Admin, Manager, Staff, Viewer)
  - Migrate existing staff.role to staff.roleId (via SQL in migration)
  - Map: 'admin' → Admin role, 'manager' → Manager role, others → Staff role
  - Drop legacy `role` column

- [x] Run migration: `pnpm db:generate && pnpm db:migrate`

- [x] Update seed script and db init to create roles automatically

- [x] Update auth service to use roleId instead of role

- [x] Update auth middleware JWTPayload to use roleId

- [x] Update WebSocket to use roleId

#### Verification

- [x] Migration runs without errors
- [x] Default roles exist in database
- [x] Existing staff have valid roleId
- [x] `pnpm typecheck` passes
- [x] Database verified via direct query

---

### Phase 9C: Role Service & Repository ✅

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Create service layer for role CRUD operations.

#### Tasks

- [x] Create `src/services/role.ts`
  - `getRoles()` - List all roles with user counts
  - `getRoleById(id)` - Get single role with user count
  - `getRoleByName(name)` - Get by name
  - `createRole(input)` - Create custom role with validation
  - `updateRole(id, input)` - Update role (prevents renaming system roles)
  - `deleteRole(id)` - Delete non-system role (prevents if users assigned)
  - `getRolePermissions(roleId)` - Get permissions array
  - `userHasPermission(userId, permission)` - Check user permission
  - `userHasAnyPermission(userId, permissions)` - Check any permission
  - `getUserPermissions(userId)` - Get all user permissions

- [x] Update `src/services/auth.ts`
  - Include roleId in JWT payload
  - Add `permissions` array to JWT (denormalized for performance)
  - Update `UserInfo` interface with roleName and permissions
  - Re-fetch permissions on token refresh

- [x] Update `src/gateway/middleware/auth.ts`
  - Add `permissions` to JWTPayload interface

- [x] Add `role` prefix to `src/utils/id.ts`

#### Verification

- [x] `pnpm typecheck` passes
- [x] Unit tests for RoleService (`tests/services/role.test.ts` - 22 tests)
- [x] Can create, read, update, delete roles via service

---

### Phase 9D: Permission Middleware ✅

> **Effort:** 0.5 day | **Risk:** Medium | **Breaking Changes:** API behavior

**Goal:** Create middleware to enforce permissions on API routes.

#### Tasks

- [x] Update `src/gateway/middleware/auth.ts`
  - Update `JWTPayload` interface to include `permissions: string[]` (done in 9C)
  - Create `requirePermission(...permissions)` middleware
  - Create `requireAnyPermission(...permissions)` middleware
  - Mark `requireRole` as deprecated (still works for backward compat)

- [x] Add permissions to JWT in `src/services/auth.ts` (done in 9C)
  - On login: fetch role, include permissions in token
  - On refresh: re-fetch permissions (in case role changed)

- [x] Export new middleware from `src/gateway/middleware/index.ts`

#### Verification

- [x] `pnpm typecheck` passes
- [x] Test: User with permission can access endpoint
- [x] Test: User without permission gets 403 Forbidden
- [x] Test: Token includes permissions array
- [x] Unit tests (`tests/gateway/permission-middleware.test.ts` - 17 tests)

---

### Phase 9E: Roles API ✅

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Create REST API for role management.

#### Tasks

- [x] Create `src/gateway/routes/roles.ts`
  ```
  GET    /api/v1/roles              → List all roles
  GET    /api/v1/roles/:id          → Get role by ID
  POST   /api/v1/roles              → Create role (admin:manage)
  PATCH  /api/v1/roles/:id          → Update role (admin:manage)
  DELETE /api/v1/roles/:id          → Delete role (admin:manage)
  GET    /api/v1/permissions        → List all available permissions
  ```

- [x] Add validation schemas (zod)
  - `createRoleSchema`: name (required, unique), description, permissions[]
  - `updateRoleSchema`: name, description, permissions[]

- [x] Register routes in `src/gateway/routes/api.ts`

- [x] Prevent deletion of system roles

- [x] Prevent deleting roles with assigned users

#### Verification

- [x] `pnpm typecheck` passes
- [x] API tests for all endpoints (`tests/gateway/roles.test.ts` - 23 tests)
- [x] Cannot delete system roles
- [x] Cannot create role with invalid permissions
- [x] Cannot delete role with assigned users

---

### Phase 9F: Staff API Updates ✅

> **Effort:** 0.5 day | **Risk:** Medium | **Breaking Changes:** API response shape

**Goal:** Create/update staff CRUD API with role assignment.

#### Tasks

- [x] Create `src/gateway/routes/staff.ts`
  ```
  GET    /api/v1/staff              → List all staff (admin:view)
  GET    /api/v1/staff/stats        → Get staff statistics (admin:view)
  GET    /api/v1/staff/:id          → Get staff by ID (admin:view)
  POST   /api/v1/staff              → Create staff (admin:manage)
  PATCH  /api/v1/staff/:id          → Update staff (admin:manage)
  PATCH  /api/v1/staff/:id/password → Update password (admin:manage)
  POST   /api/v1/staff/:id/deactivate → Deactivate staff (admin:manage)
  POST   /api/v1/staff/:id/activate   → Activate staff (admin:manage)
  ```

- [x] Add validation schemas
  - `createStaffSchema`: email, name, password, roleId, phone?
  - `updateStaffSchema`: name, phone, roleId, status
  - `updatePasswordSchema`: password (min 8 chars)

- [x] Create `src/services/staff.ts`
  - `list(options)` - List with role info, filters, search
  - `getById(id)` - Include role name
  - `getByEmail(email)` - Find by email
  - `create(input)` - Hash password, assign role
  - `update(id, input, currentUserId?)` - Update fields
  - `deactivate(id, currentUserId?)` - Set status to inactive
  - `activate(id)` - Set status to active
  - `updatePassword(id, newPassword)` - Update password
  - `getStats()` - Get staff statistics

- [x] Register routes in `src/gateway/routes/api.ts`

- [x] Prevent self-demotion (can't remove own admin access)

- [x] Prevent self-deactivation

- [x] Prevent deactivating last admin

- [x] Export `authService` singleton from `src/services/auth.ts`

#### Verification

- [x] `pnpm typecheck` passes
- [x] API tests for all endpoints (`tests/gateway/staff.test.ts` - 30 tests)
- [x] Service tests (`tests/services/staff.test.ts` - 25 tests)
- [x] Staff list includes role information
- [x] Cannot demote self or deactivate last admin

---

### Phase 9G: Apply Permissions to Existing APIs ✅

> **Effort:** 1 day | **Risk:** Medium | **Breaking Changes:** Access restrictions

**Goal:** Add permission checks to all existing API routes.

#### Tasks

- [x] Update `src/gateway/routes/conversations.ts`
  - GET endpoints: `requirePermission('conversations.view')`
  - POST/PATCH endpoints: `requirePermission('conversations.manage')`

- [x] Update `src/gateway/routes/guests.ts`
  - GET endpoints: `requirePermission('guests.view')`
  - POST/PATCH/DELETE: `requirePermission('guests.manage')`

- [x] Update `src/gateway/routes/reservations.ts`
  - GET endpoints: `requirePermission('reservations.view')`

- [x] Update `src/gateway/routes/tasks.ts`
  - GET endpoints: `requirePermission('tasks.view')`
  - POST/PATCH/DELETE: `requirePermission('tasks.manage')`

- [x] Update `src/gateway/routes/knowledge.ts`
  - GET endpoints: `requirePermission('knowledge.view')`
  - POST/PATCH/DELETE: `requirePermission('knowledge.manage')`

- [x] Update `src/gateway/routes/automation.ts`
  - GET endpoints: `requirePermission('automations.view')`
  - POST/PATCH/DELETE: `requirePermission('automations.manage')`

- [x] Update `src/gateway/routes/apps.ts`
  - GET endpoints: `requirePermission('settings.view')`
  - PUT/POST/DELETE endpoints: `requirePermission('settings.manage')`

- [x] Update `src/gateway/routes/hotel-profile.ts` (settings)
  - GET: `requirePermission('settings.view')`
  - PUT: `requirePermission('settings.manage')`

- [x] Update `src/gateway/routes/autonomy.ts` (approvals)
  - Settings GET endpoints: `requirePermission('settings.view')`
  - Settings PUT/POST endpoints: `requirePermission('settings.manage')`
  - Approvals GET endpoints: `requirePermission('approvals.view')`
  - Approvals POST (approve/reject): `requirePermission('approvals.manage')`

- [ ] Add audit log endpoint (if not exists)
  - GET: `requirePermission('audit.view')`
  - Note: Deferred - audit log not yet implemented

- [x] Update `src/gateway/routes/admin.ts`
  - Scheduler GET: `requirePermission('settings.view')`
  - Scheduler POST / PMS sync: `requirePermission('settings.manage')`

- [x] Update `src/gateway/routes/system.ts`
  - GET /status, /capabilities: `requirePermission('settings.view')`

- [x] Update `src/gateway/routes/seed.ts`
  - All endpoints: `requirePermission('admin.manage')`

**Routes that remain public (no permissions):**
- `health.ts` - Kubernetes/Docker health probes (must be unauthenticated)
- `setup.ts` - Setup wizard (runs before first user exists)
- `auth.ts` - Login/logout (must be accessible to authenticate)

#### Verification

- [x] `pnpm typecheck` passes
- [x] Test each endpoint with user who has permission (200)
- [x] Test each endpoint with user who lacks permission (403)
- [x] Existing functionality still works for admin users

---

### Phase 9H: Frontend Auth Context ✅

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Extend auth context to expose permissions for UI.

#### Tasks

- [x] Update `apps/dashboard/src/hooks/useAuth.ts` (Zustand store, not Context)
  - Add `permissions: string[]` to user state
  - Add `hasPermission(permission)` helper
  - Add `hasAnyPermission(permissions[])` helper
  - Add `hasAllPermissions(permissions[])` helper
  - Add `role` object with `id` and `name`
  - Transform API response to match new User interface

- [x] Create `apps/dashboard/src/hooks/usePermissions.ts`
  - `usePermissions()` hook returning helpers
  - `can(permission)` shorthand
  - `canAny(permissions[])` shorthand
  - `canAll(permissions[])` shorthand
  - `useCan(permission)` hook for single checks
  - `useCanAny(permissions[])` hook
  - `useCanAll(permissions[])` hook
  - `PERMISSIONS` constant for type-safe checks
  - `isAdmin` helper for wildcard detection
  - `roleName` for display

- [x] Create `apps/dashboard/src/hooks/index.ts`
  - Export all hooks for convenient imports

- [x] Update login flow to store permissions from token
  - `/auth/me` returns `permissions[]` and `roleName`
  - `transformUser()` maps API response to User object

- [x] Update token refresh to update permissions
  - `checkAuth()` re-fetches user info including permissions

#### Verification

- [x] `pnpm typecheck` passes
- [x] `usePermissions()` hook works in components
- [x] Permissions update on login/refresh

---

### Phase 9I: Users List Page (UI - English) ✅

> **Effort:** 1 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Create staff management page.

#### Tasks

- [x] Create `apps/dashboard/src/pages/settings/Users.tsx`
  - Table: name, email, role, status, last active (using DataTable component)
  - Search/filter by name, email
  - Status filter tabs (All/Active/Inactive)
  - Status badge (active/inactive)
  - Actions: Edit, Deactivate/Activate (permission-gated by ADMIN_MANAGE)

- [x] Create `apps/dashboard/src/components/users/UserFormModal.tsx`
  - Add/Edit user form
  - Fields: name, email, password (add only), role selector
  - Validation (name, email, password min 8 chars, role required)

- [x] Integrated into Settings page (`apps/dashboard/src/pages/engine/Settings.tsx`)
  - Users tab renders `UsersContent` inline
  - Only shown if user has `admin:view` permission
  - Follows same layout pattern as other Settings tabs (Hotel Profile, etc.)

- [x] Add translations for admin/users/roles navigation
  - English, Arabic, Spanish, Hindi, Russian, Chinese

#### Verification

- [x] `pnpm typecheck` passes
- [x] Page renders with user list
- [x] Can add new user
- [x] Can edit user (change role)
- [x] Can deactivate/activate user
- [x] Deactivate requires confirmation dialog
- [x] Hidden from users without `admin:view` permission

---

### Phase 9J: Roles Management Page (UI - English) ✅

> **Effort:** 1 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Create role management page.

#### Tasks

- [x] Create `apps/dashboard/src/pages/settings/Roles.tsx`
  - List of roles using DataTable component
  - System badge for built-in roles
  - User count per role
  - Permissions count (or "All permissions" for wildcard)
  - Actions: Edit, Delete (non-system only, disabled if users assigned)

- [x] Create `apps/dashboard/src/components/roles/RoleFormModal.tsx`
  - Name, description fields
  - Permission picker with grouped checkboxes
  - Cannot edit system role name
  - Shows "All permissions" message for wildcard roles
  - Select all / Deselect all per group via group header checkbox
  - Indeterminate state for partially selected groups
  - Permission descriptions displayed

- [x] Integrated into Settings page (`apps/dashboard/src/pages/engine/Settings.tsx`)
  - Roles tab renders `RolesContent` inline
  - Only shown if user has `admin:view` permission
  - Follows same layout pattern as other Settings tabs

#### Verification

- [x] `pnpm typecheck` passes
- [x] Page renders with role list
- [x] Can create custom role with permission picker
- [x] Can edit role permissions
- [x] Can delete custom role (disabled if users assigned)
- [x] Cannot delete system roles
- [x] Permission picker shows all 18 permissions in 9 groups

---

### Phase 9K: UI Permission Enforcement ✅

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Disable UI elements based on permissions (items remain visible but disabled).

#### Tasks

- [x] Update sidebar navigation
  - Disable (not hide) menu items user can't access
  - Use `can()` helper
  - Disabled items show with reduced opacity and no click handler

- [x] Update conversation page
  - Hide reply input if no `conversations.manage`
  - Hide state change dropdown if no `conversations.manage`
  - Hide task action buttons if no `tasks.manage`

- [x] Update tasks page
  - Hide create button if no `tasks.manage`
  - Disable status changes if no `tasks.manage`

- [x] Update knowledge page
  - Hide add/edit/delete if no `knowledge.manage`

- [x] Update settings pages
  - Disable tabs user can't access (Users, Roles, Danger Zone)
  - Settings uses URL-based tabs (`/settings/profile`, `/settings/users`, etc.)
  - Hide edit buttons if no `settings.manage`

- [x] Update apps page
  - Hide configure buttons if no `settings.manage`
  - Disable Danger Zone if no `settings.manage`

- [x] Update guests pages
  - Hide "Add Guest" action if no `guests.manage`
  - Hide Edit button on guest profile if no `guests.manage`

- [x] Update approvals page
  - Hide approve/reject dropdown if no `approvals.manage`

- [x] Update automations page
  - Hide "New Rule" action if no `automations.manage`
  - Hide toggle switches if no `automations.manage`

- [x] Update autonomy page
  - Disable all controls if no `settings.manage`
  - Hide Save/Reset actions if no `settings.manage`

- [x] Update site scraper page
  - Show "Access Restricted" empty state if no `knowledge.manage`
  - Hide scrape form and previously imported sources

- [x] Create route-level protection
  - `<ProtectedRoute>` component redirects unauthorized users to `/access-denied`
  - Access Denied page with "Go Back" and "Home" buttons
  - All protected routes wrapped in App.tsx

- [x] Create `<PermissionGate>` component
  ```tsx
  <PermissionGate permission="tasks.manage">
    <CreateTaskButton />
  </PermissionGate>
  ```

#### Verification

- [x] Staff user sees restricted UI (disabled menu items, hidden actions)
- [x] Manager user sees most features
- [x] Admin user sees everything
- [x] No broken UI for restricted users
- [x] Direct URL access redirects to Access Denied page

---

### Phase 9L: Manual Review Checkpoint

> **Effort:** User review | **Risk:** None | **Breaking Changes:** None

**Goal:** User reviews and approves implementation before i18n.

#### Review Checklist

- [ ] Test as Admin: full access to everything
- [ ] Test as Manager: no user/role management
- [ ] Test as Staff: limited to conversations, tasks, guests
- [ ] Test as Viewer: read-only access
- [ ] Test creating custom role with specific permissions
- [ ] Test assigning custom role to user
- [ ] Verify API returns 403 for unauthorized requests
- [ ] Verify UI disables menu items and hides actions for unauthorized users
- [ ] Check audit log captures permission-related events

#### Feedback

Document any issues or requested changes here before proceeding to i18n.

---

### Phase 9M: Internationalization (On Command)

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Add translations for all user/role management strings.

#### Tasks

- [x] Add to `apps/dashboard/src/locales/en/users.json`
  - Page titles, table headers, form labels
  - Button text, status labels
  - Error messages, confirmation dialogs

- [x] Add to `apps/dashboard/src/locales/en/roles.json`
  - Page titles, table headers, form labels
  - Permission names and descriptions
  - Group names

- [x] Add translations for other languages
  - [x] Spanish (es)
  - [x] Arabic (ar)
  - [x] Chinese (zh)
  - [x] Hindi (hi)
  - [x] Russian (ru)

- [x] Replace hardcoded strings with `t()` calls

#### Verification

- [x] All strings use i18n
- [ ] Language switcher works on new pages
- [ ] RTL layout works for Arabic

---

## Summary

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| **9A** | Permissions & Core Structure | 0.5 day | None |
| **9B** | Database Migration | 0.5 day | 9A |
| **9C** | Role Service & Repository | 0.5 day | 9B |
| **9D** | Permission Middleware | 0.5 day | 9C |
| **9E** | Roles API | 0.5 day | 9D |
| **9F** | Staff API Updates | 0.5 day | 9D |
| **9G** | Apply Permissions to APIs | 1 day | 9D |
| **9H** | Frontend Auth Context | 0.5 day | 9E, 9F |
| **9I** | Users List Page (UI) | 1 day | 9H |
| **9J** | Roles Management Page (UI) | 1 day | 9H |
| **9K** | UI Permission Enforcement ✅ | 0.5 day | 9H |
| **9L** | Manual Review | User | 9A-9K |
| **9M** | Internationalization | 0.5 day | 9L approved |

**Total Effort:** ~8 days

---

## API Reference

### Roles

```
GET    /api/v1/roles              → List all roles
GET    /api/v1/roles/:id          → Get role details
POST   /api/v1/roles              → Create custom role
PATCH  /api/v1/roles/:id          → Update role
DELETE /api/v1/roles/:id          → Delete custom role
GET    /api/v1/permissions        → List all permissions
```

### Staff

```
GET    /api/v1/staff              → List all staff
GET    /api/v1/staff/:id          → Get staff details
POST   /api/v1/staff              → Create staff member
PATCH  /api/v1/staff/:id          → Update staff member
DELETE /api/v1/staff/:id          → Deactivate staff member
```

---

## Security Considerations

1. **Last Admin Protection** - Cannot remove admin access from last admin user
2. **Self-Protection** - Cannot demote or deactivate yourself
3. **System Roles** - Cannot delete built-in roles
4. **Token Refresh** - Permissions update on token refresh
5. **Audit Logging** - Log all permission/role changes

---

## Related Documents

- [AI Assistant Framework](./001-ai-assistant-framework.md) - Setup wizard creates first admin
- [Architecture](../03-architecture/index.md) - Overall system architecture
