/**
 * Authentication Middleware
 *
 * JWT verification for protected routes.
 */

import type { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';
import { UnauthorizedError, ForbiddenError } from '@/errors/index.js';
import { loadConfig } from '@/config/index.js';
import { createLogger } from '@/utils/logger.js';
import { hasPermission, hasAnyPermission, WILDCARD_PERMISSION } from '@/core/permissions/index.js';

const log = createLogger('auth');

export interface JWTPayload {
  sub: string;
  roleId: string;
  permissions: string[];
  type?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * Require valid JWT token
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const config = loadConfig();
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const secret = new TextEncoder().encode(config.jwt.secret);
    const { payload } = await jwtVerify(token, secret);

    // Reject refresh tokens used as access tokens
    if (payload.type === 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    c.set('user', payload as unknown as JWTPayload);
    c.set('userId', payload.sub);

    await next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    log.debug({ error }, 'Token verification failed');
    throw new UnauthorizedError('Invalid or expired token');
  }
};

/**
 * Optional auth - continues without user if no valid token
 */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const config = loadConfig();
  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    try {
      const secret = new TextEncoder().encode(config.jwt.secret);
      const { payload } = await jwtVerify(token, secret);

      if (payload.type !== 'refresh') {
        c.set('user', payload as unknown as JWTPayload);
        c.set('userId', payload.sub);
      }
    } catch {
      // Invalid token - continue without user
    }
  }

  await next();
};

/**
 * Require specific role(s) by ID
 * @deprecated Use requirePermission() instead for granular access control
 */
export function requireRole(...roleIds: string[]): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user') as JWTPayload | undefined;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!roleIds.includes(user.roleId)) {
      throw new ForbiddenError(`Requires one of roles: ${roleIds.join(', ')}`);
    }

    await next();
  };
}

/**
 * Require specific permission(s)
 * User must have ALL specified permissions to access the route.
 *
 * @example
 * // Require single permission
 * app.get('/tasks', requirePermission(PERMISSIONS.TASKS_VIEW), handler)
 *
 * // Require multiple permissions (AND logic)
 * app.post('/tasks', requirePermission(PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE), handler)
 */
export function requirePermission(...permissions: string[]): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user') as JWTPayload | undefined;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userPermissions = user.permissions || [];

    // Check if user has wildcard permission
    if (userPermissions.includes(WILDCARD_PERMISSION)) {
      await next();
      return;
    }

    // Check if user has all required permissions
    const missingPermissions = permissions.filter((p) => !hasPermission(userPermissions, p));

    if (missingPermissions.length > 0) {
      log.debug(
        { userId: user.sub, required: permissions, missing: missingPermissions },
        'Permission denied'
      );
      throw new ForbiddenError(`Missing permissions: ${missingPermissions.join(', ')}`);
    }

    await next();
  };
}

/**
 * Require any of the specified permissions
 * User must have AT LEAST ONE of the specified permissions to access the route.
 *
 * @example
 * // User needs either view OR manage permission
 * app.get('/tasks/:id', requireAnyPermission(PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE), handler)
 */
export function requireAnyPermission(...permissions: string[]): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user') as JWTPayload | undefined;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userPermissions = user.permissions || [];

    // Check if user has wildcard permission
    if (userPermissions.includes(WILDCARD_PERMISSION)) {
      await next();
      return;
    }

    // Check if user has any of the required permissions
    if (!hasAnyPermission(userPermissions, permissions)) {
      log.debug(
        { userId: user.sub, required: permissions, userPermissions },
        'Permission denied - none of required permissions'
      );
      throw new ForbiddenError(`Requires one of: ${permissions.join(', ')}`);
    }

    await next();
  };
}
