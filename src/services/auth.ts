/**
 * Authentication Service
 *
 * Handles login, token generation, and user verification.
 */

import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { db, staff, roles } from '@/db/index.js';
import { loadConfig } from '@/config/index.js';
import { UnauthorizedError, NotFoundError } from '@/errors/index.js';
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

    if (user.status !== 'active') {
      log.warn({ email, status: user.status }, 'Login attempt for inactive user');
      throw new UnauthorizedError('Account is not active');
    }

    // For development, accept any password if no hash is set
    // In production, we would verify against the hash
    if (user.passwordHash) {
      const isValid = await this.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        log.warn({ email }, 'Invalid password attempt');
        throw new UnauthorizedError('Invalid credentials');
      }
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

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: role?.name || 'Unknown',
      permissions,
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
   * Verify password against hash
   * Note: In production, use bcrypt or argon2
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    // Simple comparison for development
    // TODO: Phase 6 will implement proper password hashing
    return password === hash;
  }

  /**
   * Hash a password
   * Note: In production, use bcrypt or argon2
   */
  async hashPassword(password: string): Promise<string> {
    // Simple pass-through for development
    // TODO: Phase 6 will implement proper password hashing
    return password;
  }
}

// Export singleton instance
export const authService = new AuthService();
