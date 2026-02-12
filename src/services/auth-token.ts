/**
 * Auth Token Service
 *
 * Token generation and validation for password reset and email verification.
 *
 * @module services/auth-token
 */

import { randomBytes } from 'node:crypto';
import { eq, and, lt, isNull } from 'drizzle-orm';
import { db, authTokens } from '@/db/index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';
import { ValidationError } from '@/errors/index.js';

const log = createLogger('auth-token');

// ===================
// Types
// ===================

export type TokenType = 'password_reset' | 'email_verification';

// Token expiry durations in milliseconds
const TOKEN_EXPIRY: Record<TokenType, number> = {
  password_reset: 60 * 60 * 1000, // 1 hour
  email_verification: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ===================
// Service
// ===================

export class AuthTokenService {
  /**
   * Create a new token for a staff member
   * Returns the raw token string (64 hex chars)
   */
  async createToken(staffId: string, type: TokenType): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY[type]).toISOString();

    await db.insert(authTokens).values({
      id: generateId('authToken'),
      staffId,
      type,
      token,
      expiresAt,
    });

    log.info({ staffId, type }, 'Auth token created');
    return token;
  }

  /**
   * Validate a token — checks exists, correct type, not expired, not used
   * Returns the staffId and tokenId on success
   */
  async validateToken(
    token: string,
    type: TokenType
  ): Promise<{ staffId: string; tokenId: string }> {
    const row = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.token, token))
      .get();

    if (!row) {
      throw new ValidationError('Invalid or expired token');
    }

    if (row.type !== type) {
      throw new ValidationError('Invalid or expired token');
    }

    if (row.usedAt) {
      throw new ValidationError('Token has already been used');
    }

    if (new Date(row.expiresAt) < new Date()) {
      throw new ValidationError('Token has expired');
    }

    return { staffId: row.staffId, tokenId: row.id };
  }

  /**
   * Mark a token as used
   */
  async markUsed(tokenId: string): Promise<void> {
    await db
      .update(authTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(authTokens.id, tokenId))
      .run();
  }

  /**
   * Delete all expired tokens (cleanup utility)
   */
  async deleteExpiredTokens(): Promise<number> {
    const now = new Date().toISOString();
    const result = db
      .delete(authTokens)
      .where(lt(authTokens.expiresAt, now))
      .run();

    const deleted = result.changes;
    if (deleted > 0) {
      log.info({ count: deleted }, 'Expired auth tokens deleted');
    }
    return deleted;
  }

  /**
   * Invalidate all unused tokens for a staff member of a given type
   */
  async invalidateTokens(staffId: string, type: TokenType): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(authTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokens.staffId, staffId),
          eq(authTokens.type, type),
          isNull(authTokens.usedAt)
        )
      )
      .run();
  }
}

export const authTokenService = new AuthTokenService();
