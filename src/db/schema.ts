/**
 * Database Schema - Drizzle ORM Definitions
 *
 * Core tables for Jack The Butler:
 * - settings: Global configuration
 * - guests: Guest profiles
 * - reservations: Booking records
 * - conversations: Communication threads
 * - messages: Individual messages
 * - tasks: Service requests and work orders
 * - staff: Hotel staff users
 *
 * @see docs/03-architecture/data-model.md
 */

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ===================
// Settings
// ===================

/**
 * Global configuration key-value store
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ===================
// Guests
// ===================

/**
 * Guest profiles with preferences and history
 */
export const guests = sqliteTable(
  'guests',
  {
    id: text('id').primaryKey(),

    // Identity
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),

    // Profile
    language: text('language').default('en'),
    loyaltyTier: text('loyalty_tier'),
    vipStatus: text('vip_status'),

    // External references (JSON object)
    externalIds: text('external_ids').notNull().default('{}'),

    // Preferences (JSON array)
    preferences: text('preferences').notNull().default('[]'),

    // Stats
    stayCount: integer('stay_count').notNull().default(0),
    totalRevenue: real('total_revenue').notNull().default(0),
    lastStayDate: text('last_stay_date'),

    // Metadata
    notes: text('notes'),
    tags: text('tags').default('[]'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_guests_email').on(table.email),
    uniqueIndex('idx_guests_phone').on(table.phone),
    index('idx_guests_name').on(table.lastName, table.firstName),
  ]
);

// ===================
// Reservations
// ===================

/**
 * Booking records synced from PMS
 */
export const reservations = sqliteTable(
  'reservations',
  {
    id: text('id').primaryKey(),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),

    // Identity
    confirmationNumber: text('confirmation_number').notNull().unique(),
    externalId: text('external_id'),

    // Stay details
    roomNumber: text('room_number'),
    roomType: text('room_type').notNull(),
    arrivalDate: text('arrival_date').notNull(),
    departureDate: text('departure_date').notNull(),

    // Status: confirmed, checked_in, checked_out, cancelled, no_show
    status: text('status').notNull().default('confirmed'),

    // Timing (ISO 8601 datetime strings)
    estimatedArrival: text('estimated_arrival'),
    actualArrival: text('actual_arrival'),
    estimatedDeparture: text('estimated_departure'),
    actualDeparture: text('actual_departure'),

    // Financial
    rateCode: text('rate_code'),
    totalRate: real('total_rate'),
    balance: real('balance').default(0),

    // Additional (JSON arrays)
    specialRequests: text('special_requests').default('[]'),
    notes: text('notes').default('[]'),

    // Sync tracking
    syncedAt: text('synced_at')
      .notNull()
      .default(sql`(datetime('now'))`),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_reservations_guest').on(table.guestId),
    index('idx_reservations_dates').on(table.arrivalDate, table.departureDate),
    index('idx_reservations_status').on(table.status),
    index('idx_reservations_room').on(table.roomNumber),
  ]
);

// ===================
// Staff
// ===================

/**
 * Hotel staff users
 */
export const staff = sqliteTable(
  'staff',
  {
    id: text('id').primaryKey(),

    // Identity
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone'),

    // Role: admin, manager, front_desk, concierge, housekeeping, maintenance
    role: text('role').notNull(),
    department: text('department'),

    // Permissions (JSON array)
    permissions: text('permissions').notNull().default('[]'),

    // Status: active, inactive
    status: text('status').notNull().default('active'),
    lastActiveAt: text('last_active_at'),

    // Auth (bcrypt hash)
    passwordHash: text('password_hash'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_staff_role').on(table.role), index('idx_staff_department').on(table.department)]
);

// ===================
// Conversations
// ===================

/**
 * Guest communication threads
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    guestId: text('guest_id').references(() => guests.id),
    reservationId: text('reservation_id').references(() => reservations.id),

    // Channel: whatsapp, sms, email, webchat
    channelType: text('channel_type').notNull(),
    // Phone number, email address, or session ID
    channelId: text('channel_id').notNull(),

    // State: new, active, escalated, resolved, closed
    state: text('state').notNull().default('active'),
    assignedTo: text('assigned_to').references(() => staff.id),

    // Context
    currentIntent: text('current_intent'),
    // Metadata as JSON object
    metadata: text('metadata').notNull().default('{}'),

    // Timing
    lastMessageAt: text('last_message_at'),
    resolvedAt: text('resolved_at'),

    // Timeout tracking
    idleWarnedAt: text('idle_warned_at'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_conversations_guest').on(table.guestId),
    index('idx_conversations_channel').on(table.channelType, table.channelId),
    index('idx_conversations_state').on(table.state),
    index('idx_conversations_assigned').on(table.assignedTo),
    index('idx_conversations_reservation').on(table.reservationId),
    index('idx_conversations_last_message').on(table.lastMessageAt),
  ]
);

// ===================
// Messages
// ===================

/**
 * Individual messages within conversations
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),

    // Direction: inbound, outbound
    direction: text('direction').notNull(),
    // Sender: guest, ai, staff, system
    senderType: text('sender_type').notNull(),
    senderId: text('sender_id'),

    // Content
    content: text('content').notNull(),
    // Content type: text, image, audio, video, document, location, interactive
    contentType: text('content_type').notNull().default('text'),
    // Media as JSON array
    media: text('media'),

    // AI metadata
    intent: text('intent'),
    confidence: real('confidence'),
    // Entities as JSON array
    entities: text('entities'),

    // Channel metadata
    channelMessageId: text('channel_message_id'),
    // Delivery status: pending, sent, delivered, read, failed
    deliveryStatus: text('delivery_status').default('sent'),
    deliveryError: text('delivery_error'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_messages_conversation').on(table.conversationId),
    index('idx_messages_created').on(table.conversationId, table.createdAt),
    index('idx_messages_channel_id').on(table.channelMessageId),
  ]
);

// ===================
// Tasks
// ===================

/**
 * Service requests and work orders
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').references(() => conversations.id),
    messageId: text('message_id').references(() => messages.id),

    // Source: manual, auto, automation
    source: text('source').notNull().default('manual'),

    // Type: housekeeping, maintenance, concierge, room_service, other
    type: text('type').notNull(),
    department: text('department').notNull(),

    // Details
    roomNumber: text('room_number'),
    description: text('description').notNull(),
    // Items as JSON array
    items: text('items'),
    // Priority: urgent, high, standard, low
    priority: text('priority').notNull().default('standard'),

    // Status: pending, assigned, in_progress, completed, cancelled
    status: text('status').notNull().default('pending'),
    assignedTo: text('assigned_to').references(() => staff.id),

    // External reference
    externalId: text('external_id'),
    externalSystem: text('external_system'),

    // Timing
    dueAt: text('due_at'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),

    // Notes
    notes: text('notes'),
    completionNotes: text('completion_notes'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_tasks_conversation').on(table.conversationId),
    index('idx_tasks_message').on(table.messageId),
    index('idx_tasks_status').on(table.status),
    index('idx_tasks_department').on(table.department, table.status),
    index('idx_tasks_assigned').on(table.assignedTo),
    index('idx_tasks_room').on(table.roomNumber),
    index('idx_tasks_priority').on(table.priority),
    index('idx_tasks_source').on(table.source),
    index('idx_tasks_created').on(table.createdAt),
  ]
);

// ===================
// Knowledge Base
// ===================

/**
 * Hotel knowledge base items (FAQ, policies, amenities)
 */
export const knowledgeBase = sqliteTable(
  'knowledge_base',
  {
    id: text('id').primaryKey(),

    // Category: faq, policy, amenity, service, room_type, local_info
    category: text('category').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),

    // Keywords for search (JSON array)
    keywords: text('keywords').notNull().default('[]'),

    // Status: active, archived
    status: text('status').notNull().default('active'),

    // Metadata
    priority: integer('priority').notNull().default(0),
    language: text('language').notNull().default('en'),

    // Source tracking (Phase 22)
    sourceUrl: text('source_url'),
    sourceEntryId: text('source_entry_id'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_knowledge_category').on(table.category),
    index('idx_knowledge_status').on(table.status),
  ]
);

/**
 * Knowledge embeddings for vector search
 * Note: This table stores raw embedding data.
 * For similarity search, we use sqlite-vec extension with raw SQL queries.
 */
export const knowledgeEmbeddings = sqliteTable('knowledge_embeddings', {
  id: text('id')
    .primaryKey()
    .references(() => knowledgeBase.id, { onDelete: 'cascade' }),
  // Store embedding as JSON array (sqlite-vec will handle the vector operations)
  embedding: text('embedding').notNull(),
  model: text('model').notNull(),
  dimensions: integer('dimensions').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ===================
// Type Exports
// ===================

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type KnowledgeItem = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeItem = typeof knowledgeBase.$inferInsert;

export type KnowledgeEmbedding = typeof knowledgeEmbeddings.$inferSelect;
export type NewKnowledgeEmbedding = typeof knowledgeEmbeddings.$inferInsert;

// ===================
// Automation Rules
// ===================

/**
 * Automation rules for scheduled/event-driven actions
 */
export const automationRules = sqliteTable(
  'automation_rules',
  {
    id: text('id').primaryKey(),

    // Rule identity
    name: text('name').notNull(),
    description: text('description'),

    // Trigger configuration
    // Type: time_based, event_based
    triggerType: text('trigger_type').notNull(),
    // JSON object with trigger-specific config
    triggerConfig: text('trigger_config').notNull(),

    // Action configuration (legacy - single action)
    // Type: send_message, create_task, notify_staff, webhook
    actionType: text('action_type').notNull(),
    // JSON object with action-specific config
    actionConfig: text('action_config').notNull(),

    // Action chaining (Phase 20) - JSON array of ActionDefinition[]
    // When populated, this takes precedence over actionType/actionConfig
    actions: text('actions'),

    // Retry configuration (Phase 20) - JSON: RetryConfig
    retryConfig: text('retry_config'),

    // Status
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

    // Execution tracking
    lastRunAt: text('last_run_at'),
    lastError: text('last_error'),
    runCount: integer('run_count').notNull().default(0),
    // Track consecutive failures for monitoring (Phase 20)
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_automation_rules_enabled').on(table.enabled),
    index('idx_automation_rules_trigger_type').on(table.triggerType),
  ]
);

/**
 * Log of automation rule executions
 */
export const automationLogs = sqliteTable(
  'automation_logs',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),

    // Execution details
    // Status: success, failed, skipped
    status: text('status').notNull(),
    triggerData: text('trigger_data'), // JSON object
    actionResult: text('action_result'), // JSON object
    errorMessage: text('error_message'),
    executionTimeMs: integer('execution_time_ms'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_automation_logs_rule').on(table.ruleId),
    index('idx_automation_logs_status').on(table.status),
    index('idx_automation_logs_created').on(table.createdAt),
  ]
);

export type AutomationRule = typeof automationRules.$inferSelect;
export type NewAutomationRule = typeof automationRules.$inferInsert;

export type AutomationLog = typeof automationLogs.$inferSelect;
export type NewAutomationLog = typeof automationLogs.$inferInsert;

/**
 * Automation executions for tracking action chains and retries (Phase 20)
 */
export const automationExecutions = sqliteTable(
  'automation_executions',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),

    // Trigger information
    triggeredAt: text('triggered_at').notNull(),
    triggerData: text('trigger_data'), // JSON: trigger event data

    // Execution status: pending, running, completed, failed, partial
    status: text('status').notNull(),

    // Action results (for chained actions) - JSON: ActionResult[]
    actionResults: text('action_results'),

    // Retry tracking
    attemptNumber: integer('attempt_number').notNull().default(1),
    nextRetryAt: text('next_retry_at'), // ISO timestamp for next retry
    errorMessage: text('error_message'),

    // Completion
    completedAt: text('completed_at'),
    executionTimeMs: integer('execution_time_ms'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_automation_executions_rule').on(table.ruleId),
    index('idx_automation_executions_status').on(table.status),
    index('idx_automation_executions_retry').on(table.nextRetryAt),
  ]
);

export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type NewAutomationExecution = typeof automationExecutions.$inferInsert;

// ===================
// App Configs
// ===================

/**
 * App configuration storage
 * Stores provider credentials and settings (encrypted)
 */
export const appConfigs = sqliteTable(
  'app_configs',
  {
    id: text('id').primaryKey(),

    // Identity
    appId: text('app_id').notNull(), // e.g., 'sms', 'email', 'ai'
    providerId: text('provider_id').notNull(), // e.g., 'twilio', 'mailgun', 'anthropic'

    // Status
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    // Status: not_configured, configured, connected, error, disabled
    status: text('status').notNull().default('not_configured'),

    // Configuration (encrypted JSON)
    config: text('config').notNull().default('{}'),

    // Connection tracking
    lastCheckedAt: text('last_checked_at'),
    lastError: text('last_error'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_app_configs_unique').on(table.appId, table.providerId),
    index('idx_app_configs_app').on(table.appId),
    index('idx_app_configs_status').on(table.status),
  ]
);

/**
 * App event logs
 * Tracks connection tests, syncs, webhooks, and errors
 */
export const appLogs = sqliteTable(
  'app_logs',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    providerId: text('provider_id').notNull(),

    // Event details
    // Type: connection_test, sync, webhook, send, receive, error, config_changed
    eventType: text('event_type').notNull(),
    // Status: success, failed
    status: text('status').notNull(),
    details: text('details'), // JSON object with event-specific data
    errorMessage: text('error_message'),
    latencyMs: integer('latency_ms'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_app_logs_app').on(table.appId, table.providerId),
    index('idx_app_logs_event_type').on(table.eventType),
    index('idx_app_logs_created').on(table.createdAt),
  ]
);

export type AppConfig = typeof appConfigs.$inferSelect;
export type NewAppConfig = typeof appConfigs.$inferInsert;

export type AppLog = typeof appLogs.$inferSelect;
export type NewAppLog = typeof appLogs.$inferInsert;

// ===================
// Audit Log
// ===================

/**
 * Audit log for tracking security-relevant events
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),

    // Actor information
    // Type: user, system, api, webhook
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),

    // Action performed
    action: text('action').notNull(),

    // Resource affected
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),

    // Details (JSON object)
    details: text('details'),

    // Request context
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_audit_created').on(table.createdAt),
    index('idx_audit_actor').on(table.actorType, table.actorId),
    index('idx_audit_resource').on(table.resourceType, table.resourceId),
    index('idx_audit_action').on(table.action),
  ]
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// ===================
// Response Cache
// ===================

/**
 * Cache for AI responses to common queries (FAQ-style)
 */
export const responseCache = sqliteTable(
  'response_cache',
  {
    id: text('id').primaryKey(),

    // Query fingerprint (hash of normalized query)
    queryHash: text('query_hash').notNull().unique(),

    // Original query (for debugging)
    query: text('query').notNull(),

    // Cached response
    response: text('response').notNull(),
    intent: text('intent'),

    // Usage tracking
    hitCount: integer('hit_count').notNull().default(0),
    lastHitAt: text('last_hit_at'),

    // Expiration
    expiresAt: text('expires_at').notNull(),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_response_cache_hash').on(table.queryHash),
    index('idx_response_cache_expires').on(table.expiresAt),
  ]
);

export type ResponseCacheEntry = typeof responseCache.$inferSelect;
export type NewResponseCacheEntry = typeof responseCache.$inferInsert;

// ===================
// Approval Queue
// ===================

/**
 * Queue for actions requiring staff approval (autonomy L1 mode)
 */
export const approvalQueue = sqliteTable(
  'approval_queue',
  {
    id: text('id').primaryKey(),

    // Item type: response, task, offer
    type: text('type').notNull(),
    // Action type: respondToGuest, createHousekeepingTask, etc.
    actionType: text('action_type').notNull(),
    // Action details (JSON object)
    actionData: text('action_data').notNull(),

    // Context references
    conversationId: text('conversation_id').references(() => conversations.id),
    guestId: text('guest_id').references(() => guests.id),

    // Status: pending, approved, rejected
    status: text('status').notNull().default('pending'),

    // Decision tracking
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by').references(() => staff.id),
    rejectionReason: text('rejection_reason'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_approval_queue_status').on(table.status),
    index('idx_approval_queue_created').on(table.createdAt),
    index('idx_approval_queue_conversation').on(table.conversationId),
    index('idx_approval_queue_guest').on(table.guestId),
  ]
);

export type ApprovalQueueItem = typeof approvalQueue.$inferSelect;
export type NewApprovalQueueItem = typeof approvalQueue.$inferInsert;

// ===================
// Setup State
// ===================

/**
 * Setup wizard state for fresh installations
 */
export const setupState = sqliteTable('setup_state', {
  id: text('id').primaryKey().default('setup'),
  // Status: pending, in_progress, completed
  status: text('status').notNull().default('pending'),
  currentStep: text('current_step'),
  // JSON array of completed step names
  completedSteps: text('completed_steps').notNull().default('[]'),
  // JSON object with setup context data
  context: text('context').notNull().default('{}'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type SetupState = typeof setupState.$inferSelect;
export type NewSetupState = typeof setupState.$inferInsert;
