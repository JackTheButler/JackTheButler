/**
 * Authentication Service
 *
 * Handles login, token generation, and user verification.
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db, staff, roles } from '@/db/index.js';
import { loadConfig } from '@/config/index.js';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '@/errors/index.js';
import { authSettingsService } from './auth-settings.js';
import { createLogger } from '@/utils/logger.js';
import { WILDCARD_PERMISSION } from '@/core/permissions/index.js';

const log = createLogger('auth');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  emailVerified: boolean;
  emailVerificationDeadline: string | null;
}

export class AuthService {
  private config = loadConfig();
  private secret: Uint8Array;

  constructor() {
    this.secret = new TextEncoder().encode(this.config.jwt.secret);
  }

  /**
   * Authenticate user with email and password
   */
  async login(email: string, password: string, rememberMe = false): Promise<TokenPair> {
    const [user] = await db.select().from(staff).where(eq(staff.email, email)).limit(1);

    if (!user) {
      log.warn({ email }, 'Login attempt for non-existent user');
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verify password
    if (user.passwordHash) {
      const isValid = await this.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        log.warn({ email }, 'Invalid password attempt');
        throw new UnauthorizedError('Invalid credentials');
      }
    }

    // Check approval status
    if (user.approvalStatus === 'pending') {
      throw new ForbiddenError('Your account is pending approval');
    }
    if (user.approvalStatus === 'rejected') {
      throw new ForbiddenError('Your account has been rejected');
    }

    // Check email verification
    if (!user.emailVerified) {
      const authSettings = await authSettingsService.get();

      if (authSettings.emailVerification === 'instant') {
        throw new ForbiddenError('Please verify your email before logging in', { reason: 'EMAIL_NOT_VERIFIED' });
      }

      if (authSettings.emailVerification === 'grace') {
        const graceDays = authSettings.emailVerificationGraceDays;
        const createdAt = new Date(user.createdAt).getTime();
        const deadline = createdAt + graceDays * 24 * 60 * 60 * 1000;

        if (Date.now() > deadline) {
          throw new ForbiddenError('Email verification grace period has expired. Please verify your email.', { reason: 'EMAIL_NOT_VERIFIED' });
        }
      }
    }

    // Check account status (covers manually deactivated accounts)
    if (user.status !== 'active') {
      log.warn({ email, status: user.status }, 'Login attempt for inactive user');
      throw new UnauthorizedError('Account is not active');
    }

    log.info({ userId: user.id, email, rememberMe }, 'User logged in');

    // Update last active time
    await db
      .update(staff)
      .set({ lastActiveAt: new Date().toISOString() })
      .where(eq(staff.id, user.id));

    // Get user permissions from role
    const permissions = await this.getUserPermissions(user.id, user.roleId);

    return this.generateTokens(user.id, user.roleId, permissions, rememberMe);
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const { payload } = await jwtVerify(refreshToken, this.secret);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      const userId = payload.sub as string;
      const [user] = await db.select().from(staff).where(eq(staff.id, userId)).limit(1);

      if (!user || user.status !== 'active') {
        throw new UnauthorizedError('User not found or inactive');
      }

      // Re-fetch permissions on refresh (in case role changed)
      const permissions = await this.getUserPermissions(user.id, user.roleId);

      return this.generateTokens(user.id, user.roleId, permissions);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      log.debug({ error }, 'Refresh token verification failed');
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  /**
   * Get user info by ID
   */
  async getUser(userId: string): Promise<UserInfo> {
    const [user] = await db.select().from(staff).where(eq(staff.id, userId)).limit(1);

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Get role info
    const [role] = await db.select().from(roles).where(eq(roles.id, user.roleId)).limit(1);

    // Get permissions
    const permissions = await this.getUserPermissions(user.id, user.roleId);

    // Calculate email verification deadline
    let emailVerificationDeadline: string | null = null;
    if (!user.emailVerified) {
      const authSettings = await authSettingsService.get();
      if (authSettings.emailVerification === 'grace') {
        const createdAt = new Date(user.createdAt).getTime();
        const deadline = createdAt + authSettings.emailVerificationGraceDays * 24 * 60 * 60 * 1000;
        emailVerificationDeadline = new Date(deadline).toISOString();
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: role?.name || 'Unknown',
      permissions,
      emailVerified: user.emailVerified,
      emailVerificationDeadline,
    };
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(
    userId: string,
    roleId: string,
    permissions: string[],
    rememberMe = false
  ): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessExpiresIn = 15 * 60; // 15 minutes
    // Remember me: 30 days, otherwise: 1 day
    const refreshExpiresIn = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;

    const accessToken = await new SignJWT({ sub: userId, roleId, permissions, type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + accessExpiresIn)
      .sign(this.secret);

    const refreshToken = await new SignJWT({ sub: userId, type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + refreshExpiresIn)
      .sign(this.secret);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
    };
  }

  /**
   * Generate tokens for a user by ID (used after email verification auto-login)
   */
  async generateTokensForUser(userId: string): Promise<TokenPair> {
    const [user] = await db.select().from(staff).where(eq(staff.id, userId)).limit(1);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found or inactive');
    }
    const permissions = await this.getUserPermissions(user.id, user.roleId);
    return this.generateTokens(user.id, user.roleId, permissions);
  }

  /**
   * Get permissions for a user (from role + user overrides)
   */
  private async getUserPermissions(userId: string, roleId: string): Promise<string[]> {
    // Get role permissions
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    const rolePermissions = role ? (JSON.parse(role.permissions) as string[]) : [];

    // If role has wildcard, return just the wildcard
    if (rolePermissions.includes(WILDCARD_PERMISSION)) {
      return [WILDCARD_PERMISSION];
    }

    // Get user-level permission overrides
    const [user] = await db.select().from(staff).where(eq(staff.id, userId)).limit(1);
    const userPermissions = user ? (JSON.parse(user.permissions) as string[]) : [];

    // Merge and dedupe
    const allPermissions = new Set([...rolePermissions, ...userPermissions]);
    return Array.from(allPermissions);
  }

  /**
   * Verify password against bcrypt hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Hash a password with bcrypt (cost factor 12)
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}

// Export singleton instance
export const authService = new AuthService();
