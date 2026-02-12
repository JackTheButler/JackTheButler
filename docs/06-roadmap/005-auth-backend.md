# Auth Backend — Registration, Password Recovery & Admin Settings

> Phase: Planned
> Status: Not Started
> Priority: High

## Overview

The UI pages for registration, forgot password, and reset password were built in the previous phase (UI-only, no backend). This roadmap covers:
1. Backend APIs to power those pages (register, forgot-password, reset-password, verify-email)
2. A transactional email service that uses the configured email app (Mailgun, SendGrid, etc.)
3. Admin settings to control registration behavior
4. A new "Security" tab in Settings for admins to configure these options

**Mailgun status:** The integration code is complete (`src/apps/channels/email/mailgun.ts`). You can connect Mailgun credentials via the Apps page in the dashboard and it will work for sending transactional emails.

## Design Decisions

- **No email provider configured:** Registration and password reset still work — accounts are created, tokens generated, but emails are skipped with a log warning. This avoids blocking the entire flow when email isn't set up yet.
- **Grace period UX:** During the email verification grace period, users can log in but see a warning banner in the dashboard ("Please verify your email within X days"). After expiry, login is blocked.
- **Password hashing:** Add bcrypt in this phase. DB will be reset, so no backward compatibility needed — clean bcrypt from the start.

## Data Model

### Auth Settings (in `settings` table)

Use the existing `settings` table (key-value store) with a new key `auth_settings`, following the same pattern as `hotel_profile`. The JSON value:

```typescript
interface AuthSettings {
  registrationEnabled: boolean;          // Open/closed registration
  emailVerification: 'instant' | 'grace'; // instant = must verify before login, grace = verify within N days
  emailVerificationGraceDays: number;    // Only used when emailVerification = 'grace' (default: 7)
  defaultRoleId: string | null;           // Role assigned to new accounts (null = resolve Staff role by name at runtime)
  requireAdminApproval: boolean;         // New accounts need admin approval before access
}
```

### New `auth_tokens` Table

```sql
auth_tokens (
  id            TEXT PRIMARY KEY,
  staffId       TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,  -- 'password_reset' | 'email_verification'
  token         TEXT NOT NULL UNIQUE,
  expiresAt     TEXT NOT NULL,
  usedAt        TEXT,
  createdAt     TEXT NOT NULL DEFAULT (datetime('now'))
)
```

### Staff Table Additions

Two new columns on `staff`:
- `emailVerified` INTEGER (boolean, default true) — safe default for admin-created accounts. Registration route overrides to `false`.
- `approvalStatus` TEXT (default 'approved') — values: 'pending', 'approved', 'rejected'

DB will be reset, so no migration concerns. Schema defaults (`true`, `'approved'`) ensure setup wizard and admin-created staff work without verification gates.

### Email Templates (in `settings` table)

Stored under key `email_templates` in the `settings` table, same pattern as `hotel_profile` and `auth_settings`. Plain text with `{{variable}}` placeholders replaced at send time.

```typescript
interface EmailTemplates {
  passwordReset: {
    subject: string;    // "Reset your password"
    body: string;       // "Hi {{name}}, click {{link}} to reset..."
  };
  emailVerification: {
    subject: string;    // "Verify your email"
    body: string;       // "Hi {{name}}, click {{link}} to verify..."
  };
  approvalRequest: {
    subject: string;    // "New account pending approval"
    body: string;       // "{{newUserName}} ({{newUserEmail}}) has registered..."
  };
  approvalResult: {
    subject: string;    // "Your account has been {{status}}"
    body: string;       // "Hi {{name}}, your account has been {{status}}..."
  };
}
```

Available placeholders: `{{name}}`, `{{link}}`, `{{hotelName}}`, `{{newUserName}}`, `{{newUserEmail}}`, `{{status}}`.

Defaults are hardcoded in the service so everything works out of the box. Admins can customize via settings to override defaults.

### Transactional Email

All 4 email providers (Mailgun, SendGrid, Gmail SMTP, generic SMTP) already have `sendEmail(options)` methods. Create a new `EmailService` (`src/services/email.ts`) that:
1. Looks up the first active email channel app from the registry
2. Calls `sendEmail({ to, subject, text })` on the provider instance
3. Loads templates from settings (falling back to hardcoded defaults)
4. Replaces `{{variable}}` placeholders with actual values
5. Fails gracefully with clear log warning if no email provider is configured

---

## Implementation Phases

### Phase 10A: Bcrypt Password Hashing

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** DB reset required

**Goal:** Replace plaintext password storage with bcrypt.

#### Tasks

- [ ] Add `bcrypt` dependency (`pnpm add bcrypt && pnpm add -D @types/bcrypt`)
- [ ] Update `src/services/auth.ts`
  - Replace `hashPassword()` to use `bcrypt.hash(password, 12)`
  - Replace `verifyPassword()` to use `bcrypt.compare(password, hash)`
  - No backward compatibility — clean bcrypt only
- [ ] Update existing tests that insert plaintext passwords
  - `tests/gateway/auth.test.ts`: `passwordHash: 'test123'` → use `await authService.hashPassword('test123')` in `beforeAll`
  - `tests/gateway/staff.test.ts`: same — any test user creation must use hashed passwords
  - `tests/services/staff.test.ts`: same

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Passwords are stored as bcrypt hashes
- [ ] Login works with bcrypt-hashed passwords
- [ ] All existing tests pass (`pnpm test`)

---

### Phase 10B: Database Schema Changes

> **Effort:** 0.5 day | **Risk:** Medium | **Breaking Changes:** Migration required

**Goal:** Add `auth_tokens` table and extend `staff` table.

#### Tasks

- [ ] Add `auth_tokens` table to `src/db/schema.ts`
  - id, staffId (FK), type, token (unique), expiresAt, usedAt, createdAt
- [ ] Add columns to `staff` table
  - `emailVerified` INTEGER (default `true`) — registration route overrides to `false`
  - `approvalStatus` TEXT (default `'approved'`) — registration route overrides to `'pending'` when approval required
- [ ] Verify admin-created staff paths set correct defaults
  - Setup wizard (`src/gateway/routes/setup.ts`): creates first admin — schema defaults (`true`, `'approved'`) are correct
  - Staff service (`src/services/staff.ts` `create()`): admin-created users — schema defaults are correct (no verification needed)
  - Registration route: explicitly overrides `emailVerified` and `approvalStatus` per auth settings
- [ ] Add type exports
- [ ] Run `pnpm db:generate && pnpm db:migrate`

#### Verification

- [ ] Migration runs without errors
- [ ] `pnpm typecheck` passes

---

### Phase 10C: Auth Settings Service

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** CRUD for auth settings stored in the `settings` table.

#### Tasks

- [ ] Create `src/services/auth-settings.ts`
  - Follow pattern from `src/gateway/routes/hotel-profile.ts`
  - `get()`: Returns settings with defaults if not set. For `defaultRoleId`, dynamically resolves by looking up the "Staff" role by name if no value is stored.
  - `update(input)`: Validates and saves partial updates. Validates that `defaultRoleId` references an existing role.
  - Default values:
    - `registrationEnabled: false`
    - `emailVerification: 'instant'`
    - `emailVerificationGraceDays: 7`
    - `defaultRoleId: null` (resolved at runtime to Staff role ID)
    - `requireAdminApproval: false`
- [ ] Write `tests/services/auth-settings.test.ts`
  - Returns defaults when no settings stored
  - Persists and reads back partial updates
  - Resolves `defaultRoleId` to Staff role when null
  - Rejects invalid `defaultRoleId`

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Settings persist across reads/writes
- [ ] Tests pass

---

### Phase 10D: Auth Token Service

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Token generation and validation for password reset and email verification.

#### Tasks

- [ ] Create `src/services/auth-token.ts`
  - `createToken(staffId, type)`: Generate `crypto.randomBytes(32).toString('hex')`, store with expiry
  - `validateToken(token, type)`: Check exists, correct type, not expired, not used
  - `markUsed(tokenId)`: Set usedAt timestamp
  - `deleteExpiredTokens()`: Cleanup utility
  - Expiry: password_reset = 1 hour, email_verification = 7 days
- [ ] Write `tests/services/auth-token.test.ts`
  - Creates token and stores in DB
  - Validates correct token + type
  - Rejects expired token
  - Rejects already-used token
  - Rejects wrong type
  - `markUsed` sets usedAt timestamp
  - `deleteExpiredTokens` removes only expired tokens

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Tokens generate, validate, and expire correctly
- [ ] Tests pass

---

### Phase 10E: Transactional Email Service

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Send transactional emails via configured email app.

#### Tasks

- [ ] Create `src/services/email.ts`
  - `sendPasswordResetEmail(to, name, resetToken)`: Email with reset link
  - `sendEmailVerificationEmail(to, name, verifyToken)`: Email with verify link
  - `sendApprovalRequestEmail(adminEmail, newUserName, newUserEmail)`: Notify admin
  - `sendApprovalResultEmail(to, name, approved)`: Notify user of approval/rejection
  - Private `getEmailProvider()`: Gets active email app instance from registry
  - Private `getTemplates()`: Loads from `settings` table key `email_templates`, falls back to hardcoded defaults
  - Private `renderTemplate(template, variables)`: Replaces `{{variable}}` placeholders
  - **No email configured:** Log warning and return gracefully (don't throw)
  - **Base URL for links:** Use `APP_URL` env var, falling back to `http://localhost:${PORT}`
  - **Templates:** Plain text stored in `settings` table, editable by admins. Hardcoded defaults used when no customization exists
- [ ] Write `tests/services/email.test.ts`
  - `getEmailProvider()` returns null when no email app active (mock registry)
  - `renderTemplate()` replaces all `{{placeholders}}`
  - `sendPasswordResetEmail()` calls provider with correct subject/body (mock provider)
  - Logs warning and doesn't throw when no provider configured
  - Loads custom templates from settings when available
  - Falls back to defaults when no custom templates

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Sends email when provider is configured
- [ ] Logs warning and continues when no provider configured
- [ ] Tests pass

---

### Phase 10F: Public Auth API Routes

> **Effort:** 1 day | **Risk:** Medium | **Breaking Changes:** New endpoints

**Goal:** Add registration, password recovery, and email verification endpoints.

#### Tasks

- [ ] Add to `src/gateway/routes/auth.ts` (5 new endpoints — 4 public, 1 authenticated):

  **`POST /auth/register`**
  1. Check `authSettings.registrationEnabled` → 403 if disabled
  2. Validate input (name, email format, password >= 8 chars)
  3. Check email not already taken → 409
  4. Hash password via `authService.hashPassword()`
  5. Get `authSettings.defaultRoleId` (resolve by name fallback if ID not found — see note below)
  6. Determine `emailVerified`: false (if verification enabled), true (if not)
  7. Determine `approvalStatus`: 'pending' (if approval required), 'approved' (if not)
  8. Determine `status`: 'inactive' if approval required OR instant verification; 'active' otherwise (grace period users are active immediately)
  9. Create staff record
  10. If email verification enabled → create verification token, send email
  11. If admin approval required → notify admins via email
  12. Return `{ success: true, requiresVerification, requiresApproval }`

  **`POST /auth/forgot-password`**
  1. Look up staff by email
  2. If not found → return success anyway (prevent email enumeration)
  3. Create `password_reset` token
  4. Send reset email with link: `/reset-password?token=xxx`
  5. Return `{ success: true }`

  **`POST /auth/reset-password`**
  1. Validate token (exists, not expired, not used, type = `password_reset`)
  2. Validate password >= 8 chars
  3. Hash new password
  4. Update staff `passwordHash`
  5. Mark token as used
  6. Invalidate all other reset tokens for this user
  7. Return `{ success: true }`

  **`POST /auth/verify-email`**
  1. Validate token (exists, not expired, not used, type = `email_verification`)
  2. Set `staff.emailVerified = true`
  3. If `approvalStatus = 'approved'` and `status = 'inactive'` → set `status = 'active'` (account was only gated by verification)
  4. Mark token as used
  5. Return `{ success: true }`

  **`POST /auth/resend-verification`**
  1. Require authentication (user must be logged in — only reachable during grace period)
  2. Check `emailVerified = false` → 400 if already verified
  3. Invalidate any existing verification tokens for this user
  4. Create new `email_verification` token
  5. Send verification email
  6. Return `{ success: true }`

- [ ] Write tests in `tests/gateway/auth.test.ts` (extend existing file)
  - `POST /auth/register`: returns 403 when disabled, 409 for duplicate email, creates account with correct fields, returns requiresVerification/requiresApproval flags
  - `POST /auth/register`: sets `status='inactive'` for instant verification or approval required, `'active'` for grace period
  - `POST /auth/forgot-password`: returns success for unknown email (no enumeration), creates token for known email
  - `POST /auth/reset-password`: rejects invalid/expired/used token, updates password, invalidates other tokens
  - `POST /auth/verify-email`: sets `emailVerified=true`, activates account when only gated by verification, doesn't activate when approval still pending
  - `POST /auth/resend-verification`: requires auth, rejects if already verified, invalidates old tokens

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Registration works when enabled, returns 403 when disabled
- [ ] Registration sets `status='inactive'` for instant verification or approval required
- [ ] Password reset generates token, validates it, updates password
- [ ] Email verification sets `emailVerified = true` and activates account if only gated by verification
- [ ] Unknown email on forgot-password returns success (no enumeration)
- [ ] Resend verification invalidates old tokens and sends new email
- [ ] Tests pass

---

### Phase 10G: Login Enforcement (Verification & Approval)

> **Effort:** 0.5 day | **Risk:** Medium | **Breaking Changes:** Login behavior

**Goal:** Enforce email verification and admin approval during login.

#### Tasks

- [ ] Update `src/services/auth.ts` — `AuthService.login()`, after password check:
  1. If `emailVerified = false` and `emailVerification = 'instant'` → reject: "Please verify your email"
  2. If `emailVerified = false` and `emailVerification = 'grace'` → check if within grace period from `createdAt`, reject if expired
  3. If `approvalStatus = 'pending'` → reject: "Your account is pending approval"
  4. If `approvalStatus = 'rejected'` → reject: "Your account has been rejected"
- [ ] Include `emailVerified` and `emailVerificationDeadline` in `/auth/me` response
- [ ] Write tests in `tests/gateway/auth.test.ts` (extend)
  - Login rejected for unverified user with instant verification (correct error code)
  - Login succeeds for unverified user within grace period
  - Login rejected for unverified user past grace period
  - Login rejected for pending-approval user
  - Login rejected for rejected user
  - `/auth/me` includes `emailVerified` and `emailVerificationDeadline`

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Unverified user with instant verification cannot login
- [ ] Unverified user within grace period can login
- [ ] Unverified user past grace period cannot login
- [ ] Pending-approval user cannot login
- [ ] Rejected user cannot login
- [ ] Tests pass

---

### Phase 10H: Admin Approval Endpoints

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Allow admins to approve/reject new registrations.

#### Tasks

- [ ] Add to `src/gateway/routes/staff.ts` (requires `ADMIN_MANAGE`):
  - `POST /api/v1/staff/:id/approve` — sets `approvalStatus='approved'`. Sets `status='active'` only if `emailVerified=true` or verification mode is `'grace'` (otherwise user still needs to verify first). Sends approval notification email.
  - `POST /api/v1/staff/:id/reject` — sets `approvalStatus='rejected'`, sends rejection notification email
- [ ] Add `approvalStatus` filter to existing `GET /api/v1/staff` endpoint
- [ ] Write tests in `tests/gateway/staff.test.ts` (extend)
  - Approve sets `approvalStatus='approved'` and activates if verified
  - Approve doesn't activate if instant verification still pending
  - Reject sets `approvalStatus='rejected'`
  - Both require `admin:manage` permission
  - `GET /api/v1/staff?approvalStatus=pending` filters correctly

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Admins can approve/reject pending accounts
- [ ] Approved accounts can login
- [ ] Rejected accounts cannot login
- [ ] Tests pass

---

### Phase 10I: Auth Settings API Routes

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** REST API for managing auth settings.

#### Tasks

- [ ] Create `src/gateway/routes/auth-settings.ts`
  - `GET /api/v1/settings/auth` — requires `ADMIN_VIEW`, returns auth settings (via `AuthSettingsService`)
  - `PUT /api/v1/settings/auth` — requires `ADMIN_MANAGE`, validates and saves (via `AuthSettingsService`)
  - `GET /api/v1/settings/email-templates` — requires `ADMIN_VIEW`, returns email templates merged with defaults. Reads directly from `settings` table (same pattern as `hotel-profile.ts`), merges with hardcoded defaults from `EmailService`.
  - `PUT /api/v1/settings/email-templates` — requires `ADMIN_MANAGE`, validates structure (all 4 template keys with subject + body), saves to `settings` table
- [ ] Register in `src/gateway/routes/api.ts`
- [ ] Write `tests/gateway/auth-settings.test.ts`
  - `GET /api/v1/settings/auth` returns defaults when not configured
  - `PUT /api/v1/settings/auth` persists changes
  - Requires `admin:view` / `admin:manage` permissions respectively
  - `GET /api/v1/settings/email-templates` returns defaults merged with customizations
  - `PUT /api/v1/settings/email-templates` validates structure and persists

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Settings read/write works
- [ ] Requires correct permissions
- [ ] Tests pass

---

### Phase 10J: Dashboard — Security Settings Tab

> **Effort:** 1 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Admin UI for configuring auth settings.

#### Tasks

- [ ] Create `apps/dashboard/src/pages/settings/Security.tsx`
  - Follow pattern from `apps/dashboard/src/pages/settings/Users.tsx`
  - 5 sections:
    1. **Registration** — Switch toggle (open/closed)
    2. **Email Verification** — Radio: "Instant" / "Grace period" + number input for days
    3. **Default Role** — Dropdown populated from `GET /api/v1/roles`
    4. **Admin Approval** — Switch toggle
    5. **Email Templates** — Expandable section with editable subject + body for each template type (password reset, email verification, approval request, approval result). Shows available `{{placeholders}}` as helper text.
  - Fetch on mount, save button, success toast

- [ ] Update `apps/dashboard/src/pages/engine/Settings.tsx`
  - Add "Security" tab with Lock icon between "Roles" and "Quick Setup"
  - Permission: `ADMIN_MANAGE`

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Security tab visible to admins
- [ ] Settings persist when saved

---

### Phase 10K: Wire Frontend Pages to Backend

> **Effort:** 1 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Connect existing UI pages to new backend APIs.

#### Tasks

- [ ] Update `apps/dashboard/src/pages/Register.tsx`
  - Call `POST /auth/register`
  - Handle registrationDisabled / requiresVerification / requiresApproval states
- [ ] Update `apps/dashboard/src/pages/ForgotPassword.tsx`
  - Call `POST /auth/forgot-password`
- [ ] Update `apps/dashboard/src/pages/ResetPassword.tsx`
  - Read token from URL params, call `POST /auth/reset-password`
- [ ] Update `apps/dashboard/src/pages/Login.tsx`
  - Handle new error codes for unverified / pending-approval

#### Verification

- [ ] `pnpm typecheck` passes
- [ ] Registration flow works end-to-end
- [ ] Forgot password → reset password flow works end-to-end
- [ ] Login shows appropriate errors for unverified/pending accounts

---

### Phase 10L: Email Verification Warning Banner

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Show unverified users a warning banner during grace period.

#### Tasks

- [ ] Update `apps/dashboard/src/components/layout/Layout.tsx`
  - Add dismissible warning banner when `emailVerified = false` and auth settings use grace period
  - Banner text: "Please verify your email within X days"
  - Include "Resend verification email" link
  - Uses `emailVerified` and `emailVerificationDeadline` from `/auth/me`

#### Verification

- [ ] Banner shows for unverified users in grace period
- [ ] Banner doesn't show for verified users
- [ ] "Resend" link works

---

### Phase 10M: Localization

> **Effort:** 0.5 day | **Risk:** Low | **Breaking Changes:** None

**Goal:** Add translations for all new auth strings.

#### Tasks

- [ ] Add new keys to all 6 locale files (`en`, `ar`, `es`, `hi`, `ru`, `zh`):
  - Security settings tab labels
  - Registration disabled message
  - Email verification required message
  - Account pending approval message
  - Account rejected message
  - Approval/rejection notification text
  - Password reset email text
  - Verification banner text

#### Verification

- [ ] All new strings use `t()` calls
- [ ] `pnpm typecheck` passes

---

## Key Files Summary

| Purpose | File | Action |
|---------|------|--------|
| Password hashing | `src/services/auth.ts` | Add bcrypt, enforce verification & approval on login |
| DB schema | `src/db/schema.ts` | Add `auth_tokens` table, extend `staff` |
| Auth settings service | `src/services/auth-settings.ts` | New |
| Auth token service | `src/services/auth-token.ts` | New |
| Transactional email | `src/services/email.ts` | New |
| Auth routes | `src/gateway/routes/auth.ts` | Add register, forgot/reset-password, verify-email, resend-verification |
| Auth settings routes | `src/gateway/routes/auth-settings.ts` | New |
| API route registration | `src/gateway/routes/api.ts` | Register new routes |
| Staff routes | `src/gateway/routes/staff.ts` | Add approve/reject endpoints |
| Security settings UI | `apps/dashboard/src/pages/settings/Security.tsx` | New |
| Settings page | `apps/dashboard/src/pages/engine/Settings.tsx` | Add Security tab |
| Verification banner | `apps/dashboard/src/components/layout/Layout.tsx` | Add email verification warning |
| Frontend pages | `apps/dashboard/src/pages/{ForgotPassword,ResetPassword,Register,Login}.tsx` | Wire to backend |
| Locales | `apps/dashboard/src/locales/*/auth.json` | Add new keys |
| New dependency | `package.json` | Add `bcrypt` + `@types/bcrypt` |

## Pattern References

| Creating... | Follow this example |
|-------------|---------------------|
| Settings service | `src/gateway/routes/hotel-profile.ts` (reads/writes `settings` table) |
| New service | `src/services/task.ts` (singleton pattern) |
| New API route | `src/gateway/routes/tasks.ts` |
| New settings tab | `apps/dashboard/src/pages/settings/Users.tsx` |
| Token generation | `src/utils/crypto.ts` (use `crypto.randomBytes`) |

## Summary

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| **10A** | Bcrypt Password Hashing | 0.5 day | None |
| **10B** | Database Schema Changes | 0.5 day | None |
| **10C** | Auth Settings Service | 0.5 day | 10B |
| **10D** | Auth Token Service | 0.5 day | 10B |
| **10E** | Transactional Email Service | 0.5 day | None |
| **10F** | Public Auth API Routes | 1 day | 10A, 10B, 10C, 10D, 10E |
| **10G** | Login Enforcement | 0.5 day | 10C, 10F |
| **10H** | Admin Approval Endpoints | 0.5 day | 10E, 10F |
| **10I** | Auth Settings API Routes | 0.5 day | 10C |
| **10J** | Security Settings Tab (UI) | 1 day | 10I |
| **10K** | Wire Frontend Pages | 1 day | 10F, 10G |
| **10L** | Verification Warning Banner | 0.5 day | 10G, 10K |
| **10M** | Localization | 0.5 day | 10J, 10K, 10L |

**Total Effort:** ~8 days

---

## Verification Scenarios

1. **No email provider configured:** Register → account created, no email sent, log warning. Forgot password → returns success but no email, log warning.
2. **Registration closed:** `POST /auth/register` returns 403.
3. **Registration open, instant verification:** Register → account created (inactive, `emailVerified=false`), email sent with verify link. Login before verify → rejected. Click verify → `emailVerified=true`, `status='active'`. Login → success.
4. **Registration open, grace period:** Register → account created (active, `emailVerified=false`). Login works immediately. Banner shown with "Resend" link. After N days without verification → login rejected.
5. **Admin approval required:** Register → account created (inactive, `approvalStatus='pending'`). Admin sees pending in Users tab. Admin approves → `approvalStatus='approved'`, `status='active'`, notification email sent.
6. **Instant verification + approval:** Register → inactive, pending, unverified. Admin approves → `status` stays inactive (still needs verification). User verifies → `status='active'`.
7. **Password reset:** Forgot password → email with link. Click link → reset form. Submit new password → success. Old password no longer works.
8. **Admin-created staff:** Created via Users page → `emailVerified=true`, `approvalStatus='approved'`, `status='active'`. No verification gates.
9. **Resend verification:** Grace period user clicks "Resend" → old tokens invalidated, new token created, email sent.
10. **Run `pnpm typecheck` — no errors.**
11. **Run `pnpm test` — existing tests pass.**

---

## Security Considerations

1. **No email enumeration** — Forgot password always returns success regardless of email existence
2. **Token expiry** — Password reset tokens expire in 1 hour, verification tokens in 7 days
3. **Single-use tokens** — Tokens are marked as used after consumption
4. **Bcrypt** — Cost factor 12 for password hashing
5. **Rate limiting** — Public auth endpoints should be rate-limited (future enhancement)

---

## Related Documents

- [User & Role Management](./004-user-role-management.md) — Roles, permissions, staff management
- [AI Assistant Framework](./001-ai-assistant-framework.md) — Setup wizard creates first admin
