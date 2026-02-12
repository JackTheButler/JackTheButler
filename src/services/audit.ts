/**
 * Audit Logging Service
 *
 * Records security-relevant events for compliance and investigation.
 */

import { randomUUID } from 'node:crypto';
import { eq, desc, and, gte } from 'drizzle-orm';
import { db, auditLog, type AuditLogEntry, type NewAuditLogEntry } from '@/db/index.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('audit');

/**
 * Actor types for audit events
 */
export type ActorType = 'user' | 'system' | 'api' | 'webhook';

/**
 * Common audit actions
 */
export type AuditAction =
  // Authentication
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'token_refresh'
  | 'password_change'
  // Data access
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  // Configuration
  | 'config_change'
  | 'app_test'
  | 'app_toggle'
  // Automation
  | 'rule_executed'
  | 'rule_failed'
  // Conversations
  | 'message_sent'
  | 'conversation_escalated'
  | 'conversation_resolved'
  // Tasks
  | 'task_assigned'
  | 'task_completed';

/**
 * Resource types for audit events
 */
export type ResourceType =
  | 'staff'
  | 'guest'
  | 'conversation'
  | 'message'
  | 'task'
  | 'app'
  | 'automation'
  | 'knowledge'
  | 'system';

/**
 * Audit event details
 */
export interface AuditEventInput {
  actorType: ActorType;
  actorId?: string | undefined;
  action: AuditAction | string;
  resourceType: ResourceType | string;
  resourceId?: string | undefined;
  details?: Record<string, unknown> | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Audit query options
 */
export interface AuditQueryOptions {
  actorType?: ActorType;
  actorId?: string;
  action?: AuditAction | string;
  resourceType?: ResourceType | string;
  resourceId?: string;
  since?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Audit Logging Service
 */
export class AuditService {
  /**
   * Record an audit event
   */
  async log(event: AuditEventInput): Promise<AuditLogEntry> {
    const entry: NewAuditLogEntry = {
      id: randomUUID(),
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId ?? null,
      details: event.details ? JSON.stringify(event.details) : null,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
    };

    const results = await db.insert(auditLog).values(entry).returning();
    const result = results[0];

    if (!result) {
      throw new Error('Failed to insert audit log entry');
    }

    log.debug(
      {
        id: result.id,
        actorType: result.actorType,
        action: result.action,
        resourceType: result.resourceType,
      },
      'Audit event recorded'
    );

    return result;
  }

  /**
   * Query audit events
   */
  async query(options: AuditQueryOptions = {}): Promise<AuditLogEntry[]> {
    const conditions = [];

    if (options.actorType) {
      conditions.push(eq(auditLog.actorType, options.actorType));
    }
    if (options.actorId) {
      conditions.push(eq(auditLog.actorId, options.actorId));
    }
    if (options.action) {
      conditions.push(eq(auditLog.action, options.action));
    }
    if (options.resourceType) {
      conditions.push(eq(auditLog.resourceType, options.resourceType));
    }
    if (options.resourceId) {
      conditions.push(eq(auditLog.resourceId, options.resourceId));
    }
    if (options.since) {
      conditions.push(gte(auditLog.createdAt, options.since.toISOString()));
    }

    let query = db.select().from(auditLog);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query
      .orderBy(desc(auditLog.createdAt))
      .limit(options.limit ?? 100)
      .offset(options.offset ?? 0);

    return results;
  }

  /**
   * Get audit events for a specific resource
   */
  async getResourceHistory(
    resourceType: ResourceType | string,
    resourceId: string,
    limit = 50
  ): Promise<AuditLogEntry[]> {
    return this.query({ resourceType, resourceId, limit });
  }

  /**
   * Get audit events for a specific actor
   */
  async getActorHistory(actorType: ActorType, actorId: string, limit = 50): Promise<AuditLogEntry[]> {
    return this.query({ actorType, actorId, limit });
  }

  /**
   * Get recent security events (login failures, etc.)
   */
  async getSecurityEvents(since: Date, limit = 100): Promise<AuditLogEntry[]> {
    const securityActions = ['login', 'logout', 'login_failed', 'password_change', 'config_change'];

    const results = await db
      .select()
      .from(auditLog)
      .where(
        and(
          gte(auditLog.createdAt, since.toISOString()),
          // Note: SQLite doesn't support IN with array, so we'd need multiple OR conditions
          // For now, we'll filter in memory
        )
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(limit * 2); // Fetch more to account for filtering

    return results.filter((e) => securityActions.includes(e.action)).slice(0, limit);
  }
}

// Singleton instance
let auditInstance: AuditService | null = null;

/**
 * Get the audit service instance
 */
export function getAuditService(): AuditService {
  if (!auditInstance) {
    auditInstance = new AuditService();
  }
  return auditInstance;
}

/**
 * Helper to log authentication events
 */
export async function logAuthEvent(
  action: 'login' | 'logout' | 'login_failed' | 'token_refresh' | 'register' | 'password_reset',
  staffId: string | undefined,
  details?: Record<string, unknown> | undefined,
  context?: { ip?: string | undefined; userAgent?: string | undefined } | undefined
): Promise<void> {
  const audit = getAuditService();
  await audit.log({
    actorType: staffId ? 'user' : 'system',
    actorId: staffId ?? undefined,
    action,
    resourceType: 'staff',
    resourceId: staffId ?? undefined,
    details: details ?? undefined,
    ipAddress: context?.ip ?? undefined,
    userAgent: context?.userAgent ?? undefined,
  });
}

/**
 * Helper to log configuration changes
 */
export async function logConfigChange(
  staffId: string,
  resourceType: ResourceType | string,
  resourceId: string,
  details: Record<string, unknown>,
  context?: { ip?: string | undefined; userAgent?: string | undefined } | undefined
): Promise<void> {
  const audit = getAuditService();
  await audit.log({
    actorType: 'user',
    actorId: staffId,
    action: 'config_change',
    resourceType,
    resourceId,
    details,
    ipAddress: context?.ip ?? undefined,
    userAgent: context?.userAgent ?? undefined,
  });
}
