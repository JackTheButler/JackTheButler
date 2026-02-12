/**
 * Authentication Routes
 *
 * Login, logout, token refresh, registration, password recovery,
 * and email verification endpoints.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, staff } from '@/db/index.js';
import { validateBody, requireAuth, getClientIp } from '../middleware/index.js';
import { authService } from '@/services/auth.js';
import { logAuthEvent } from '@/services/audit.js';
import { authSettingsService } from '@/services/auth-settings.js';
import { authTokenService } from '@/services/auth-token.js';
import { emailService } from '@/services/email.js';
import { staffService } from '@/services/staff.js';
import { generateId } from '@/utils/id.js';
import { SYSTEM_ROLE_IDS } from '@/core/permissions/defaults.js';
import { ForbiddenError, ValidationError, ConflictError } from '@/errors/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('routes:auth');

// Define custom variables type for Hono context
type Variables = {
  validatedBody: unknown;
  userId: string;
};

const auth = new Hono<{ Variables: Variables }>();

// ===================
// Schemas
// ===================

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// ===================
// Existing Routes
// ===================

/**
 * POST /auth/login
 * Authenticate with email and password
 */
auth.post('/login', validateBody(loginSchema), async (c) => {
  const { email, password, rememberMe } = c.get('validatedBody') as z.infer<typeof loginSchema>;
  const ip = getClientIp(c);
  const userAgent = c.req.header('user-agent');

  try {
    const tokens = await authService.login(email, password, rememberMe);

    // Log successful login (userId not available from TokenPair, so we log email)
    logAuthEvent('login', undefined, { email }, { ip, userAgent: userAgent ?? undefined }).catch(() => {});

    return c.json(tokens);
  } catch (error) {
    // Log failed login attempt
    logAuthEvent('login_failed', undefined, { email, reason: (error as Error).message }, { ip, userAgent: userAgent ?? undefined }).catch(() => {});
    throw error;
  }
});

/**
 * GET /auth/registration-status
 * Check if registration is enabled (public, no auth required)
 */
auth.get('/registration-status', async (c) => {
  const authSettings = await authSettingsService.get();
  return c.json({ registrationEnabled: authSettings.registrationEnabled });
});

/**
 * POST /auth/refresh
 * Get new access token using refresh token
 */
auth.post('/refresh', validateBody(refreshSchema), async (c) => {
  const { refreshToken } = c.get('validatedBody') as z.infer<typeof refreshSchema>;

  const tokens = await authService.refresh(refreshToken);

  return c.json(tokens);
});

/**
 * GET /auth/me
 * Get current authenticated user info
 */
auth.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId');

  const user = await authService.getUser(userId);

  return c.json({ user });
});

/**
 * POST /auth/logout
 * Invalidate refresh token (future: add to blacklist)
 */
auth.post('/logout', requireAuth, async (c) => {
  const userId = c.get('userId');
  const ip = getClientIp(c);
  const userAgent = c.req.header('user-agent');

  // Log logout event
  logAuthEvent('logout', userId, {}, { ip, userAgent: userAgent ?? undefined }).catch(() => {});

  // In a production system, we would add the token to a blacklist
  // For now, just return success
  return c.json({ message: 'Logged out successfully' });
});

// ===================
// Registration
// ===================

/**
 * POST /auth/register
 * Register a new account (public, rate-limited)
 */
auth.post('/register', validateBody(registerSchema), async (c) => {
  const { name, email, password } = c.get('validatedBody') as z.infer<typeof registerSchema>;

  // Check if registration is enabled
  const authSettings = await authSettingsService.get();
  if (!authSettings.registrationEnabled) {
    throw new ForbiddenError('Registration is currently disabled');
  }

  // Check if email is already taken
  const existing = await staffService.getByEmail(email);
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  // Determine field values based on settings
  const needsApproval = authSettings.requireAdminApproval;
  const isInstantVerification = authSettings.emailVerification === 'instant';

  const emailVerified = false; // Registration always starts unverified
  const approvalStatus = needsApproval ? 'pending' : 'approved';
  // Inactive if approval required OR instant verification; active for grace period
  const status = needsApproval || isInstantVerification ? 'inactive' : 'active';

  // Hash password and create staff record
  const passwordHash = await authService.hashPassword(password);
  const staffId = generateId('staff');

  await db.insert(staff).values({
    id: staffId,
    email: email.toLowerCase(),
    name,
    roleId: authSettings.defaultRoleId || SYSTEM_ROLE_IDS.STAFF,
    status,
    passwordHash,
    emailVerified,
    approvalStatus,
  });

  // Send verification email (always required for registration)
  const verifyToken = await authTokenService.createToken(staffId, 'email_verification');
  await emailService.sendEmailVerificationEmail(email, name, verifyToken);

  // Notify admins if approval is required
  if (needsApproval) {
    const admins = await staffService.list({ roleId: SYSTEM_ROLE_IDS.ADMIN, status: 'active' });
    for (const admin of admins) {
      await emailService.sendApprovalRequestEmail(admin.email, name, email);
    }
  }

  const ip = getClientIp(c);
  const userAgent = c.req.header('user-agent');
  logAuthEvent('register', staffId, { email }, { ip, userAgent: userAgent ?? undefined }).catch(() => {});

  // Auto-login if account is immediately active (grace period, no approval needed)
  const canAutoLogin = status === 'active' && !needsApproval;
  const tokens = canAutoLogin ? await authService.generateTokensForUser(staffId) : undefined;

  return c.json(
    {
      success: true,
      requiresVerification: isInstantVerification,
      requiresApproval: needsApproval,
      tokens,
    },
    201
  );
});

// ===================
// Password Recovery
// ===================

/**
 * POST /auth/forgot-password
 * Request a password reset email (public)
 */
auth.post('/forgot-password', validateBody(forgotPasswordSchema), async (c) => {
  const { email } = c.get('validatedBody') as z.infer<typeof forgotPasswordSchema>;

  // Always return success to prevent email enumeration
  const user = await staffService.getByEmail(email);
  if (user) {
    const token = await authTokenService.createToken(user.id, 'password_reset');
    await emailService.sendPasswordResetEmail(email, user.name, token);
  }

  return c.json({ success: true });
});

/**
 * POST /auth/reset-password
 * Reset password using a token (public)
 */
auth.post('/reset-password', validateBody(resetPasswordSchema), async (c) => {
  const { token, password } = c.get('validatedBody') as z.infer<typeof resetPasswordSchema>;

  // Validate token
  const { staffId, tokenId } = await authTokenService.validateToken(token, 'password_reset');

  // Hash and update password
  const passwordHash = await authService.hashPassword(password);
  await db
    .update(staff)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(staff.id, staffId))
    .run();

  // Mark token as used and invalidate other reset tokens
  await authTokenService.markUsed(tokenId);
  await authTokenService.invalidateTokens(staffId, 'password_reset');

  log.info({ staffId }, 'Password reset completed');

  return c.json({ success: true });
});

// ===================
// Email Verification
// ===================

/**
 * POST /auth/verify-email
 * Verify email address using a token (public)
 */
auth.post('/verify-email', validateBody(verifyEmailSchema), async (c) => {
  const { token } = c.get('validatedBody') as z.infer<typeof verifyEmailSchema>;

  // Validate token
  const { staffId, tokenId } = await authTokenService.validateToken(token, 'email_verification');

  // Set emailVerified = true
  const now = new Date().toISOString();
  await db
    .update(staff)
    .set({ emailVerified: true, updatedAt: now })
    .where(eq(staff.id, staffId))
    .run();

  // If account was only gated by verification (approved but inactive), activate it
  const [user] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
  if (user && user.approvalStatus === 'approved' && user.status === 'inactive') {
    await db
      .update(staff)
      .set({ status: 'active', updatedAt: now })
      .where(eq(staff.id, staffId))
      .run();
  }

  // Mark token as used
  await authTokenService.markUsed(tokenId);

  log.info({ staffId }, 'Email verified');

  // Re-fetch user to get updated status
  const [updatedUser] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
  const canAutoLogin = updatedUser && updatedUser.status === 'active' && updatedUser.approvalStatus === 'approved';

  if (canAutoLogin) {
    const tokens = await authService.generateTokensForUser(staffId);
    return c.json({ success: true, tokens });
  }

  return c.json({ success: true, requiresApproval: updatedUser?.approvalStatus === 'pending' });
});

/**
 * POST /auth/resend-verification-email
 * Resend email verification by email address (public, no auth required)
 * Always returns success to prevent email enumeration.
 */
auth.post('/resend-verification-email', validateBody(forgotPasswordSchema), async (c) => {
  const { email } = c.get('validatedBody') as z.infer<typeof forgotPasswordSchema>;

  const user = await staffService.getByEmail(email);
  if (user) {
    // Look up the raw staff record for emailVerified
    const [raw] = await db.select().from(staff).where(eq(staff.id, user.id)).limit(1);
    if (raw && !raw.emailVerified) {
      await authTokenService.invalidateTokens(user.id, 'email_verification');
      const verifyToken = await authTokenService.createToken(user.id, 'email_verification');
      await emailService.sendEmailVerificationEmail(raw.email, raw.name, verifyToken);
    }
  }

  return c.json({ success: true });
});

/**
 * POST /auth/resend-verification
 * Resend email verification (requires authentication — grace period users)
 */
auth.post('/resend-verification', requireAuth, async (c) => {
  const userId = c.get('userId');

  // Check if already verified
  const [user] = await db.select().from(staff).where(eq(staff.id, userId)).limit(1);
  if (!user) {
    throw new ValidationError('User not found');
  }

  if (user.emailVerified) {
    throw new ValidationError('Email is already verified');
  }

  // Invalidate existing verification tokens
  await authTokenService.invalidateTokens(userId, 'email_verification');

  // Create new token and send email
  const verifyToken = await authTokenService.createToken(userId, 'email_verification');
  await emailService.sendEmailVerificationEmail(user.email, user.name, verifyToken);

  return c.json({ success: true });
});

export { auth as authRoutes };
