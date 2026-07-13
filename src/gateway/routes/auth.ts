/**
 * Authentication Routes
 *
 * Login, logout, token refresh, registration, password recovery,
 * and email verification endpoints.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody, requireAuth, getClientIp } from '../middleware/index.js';
import { authService } from '@/auth/auth.js';
import { logAuthEvent } from '@/services/audit.js';
import { authSettingsService } from '@/auth/auth-settings.js';
import { authTokenService } from '@/auth/auth-token.js';
import { emailService } from '@/services/email.js';
import { staffService } from '@/services/staff.js';
import { SYSTEM_ROLE_IDS } from '@/permissions/defaults.js';
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
  const staffId = await staffService.register({
    email,
    name,
    passwordHash,
    roleId: authSettings.defaultRoleId || SYSTEM_ROLE_IDS.STAFF,
    status,
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
  await staffService.updatePassword(staffId, password);

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

  // Set emailVerified = true, activating the account if it was only gated by verification
  const { canAutoLogin, requiresApproval } = await staffService.verifyEmail(staffId);

  // Mark token as used
  await authTokenService.markUsed(tokenId);

  log.info({ staffId }, 'Email verified');

  if (canAutoLogin) {
    const tokens = await authService.generateTokensForUser(staffId);
    return c.json({ success: true, tokens });
  }

  return c.json({ success: true, requiresApproval });
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
    const info = await staffService.getVerificationInfo(user.id);
    if (info && !info.emailVerified) {
      await authTokenService.invalidateTokens(user.id, 'email_verification');
      const verifyToken = await authTokenService.createToken(user.id, 'email_verification');
      await emailService.sendEmailVerificationEmail(info.email, info.name, verifyToken);
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
  const info = await staffService.getVerificationInfo(userId);
  if (!info) {
    throw new ValidationError('User not found');
  }

  if (info.emailVerified) {
    throw new ValidationError('Email is already verified');
  }

  // Invalidate existing verification tokens
  await authTokenService.invalidateTokens(userId, 'email_verification');

  // Create new token and send email
  const verifyToken = await authTokenService.createToken(userId, 'email_verification');
  await emailService.sendEmailVerificationEmail(info.email, info.name, verifyToken);

  return c.json({ success: true });
});

export { auth as authRoutes };
