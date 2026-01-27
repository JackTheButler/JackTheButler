/**
 * Jack The Butler - Database Schema
 *
 * Complete Drizzle ORM schema definition for SQLite.
 * This schema is PMS-agnostic - external system IDs are stored as references
 * while Jack maintains its own internal identifiers.
 *
 * @see ../../../03-architecture/data-model.md for entity relationships
 */

import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// =============================================================================
// ENUMS (as TypeScript types - SQLite doesn't have native enums)
// =============================================================================

/** Channel types for guest communication */
export type ChannelType = 'whatsapp' | 'sms' | 'email' | 'webchat';

/** Conversation states */
export type ConversationState = 'new' | 'active' | 'escalated' | 'resolved' | 'abandoned';

/** Message direction */
export type MessageDirection = 'inbound' | 'outbound';

/** Message sender types */
export type SenderType = 'guest' | 'ai' | 'staff' | 'system';

/** Message content types */
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'interactive';

/** Message delivery status */
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

/** Task types */
export type TaskType = 'housekeeping' | 'maintenance' | 'concierge' | 'room_service' | 'front_desk' | 'valet' | 'spa' | 'other';

/** Task priority levels */
export type TaskPriority = 'urgent' | 'high' | 'standard' | 'low';

/** Task status */
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

/** Reservation status */
export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

/** Staff roles */
export type StaffRole = 'admin' | 'manager' | 'front_desk' | 'concierge' | 'housekeeping' | 'maintenance';

/** Staff status */
export type StaffStatus = 'active' | 'inactive';

/** Guest loyalty tiers */
export type LoyaltyTier = 'member' | 'silver' | 'gold' | 'platinum' | 'diamond';

/** Preference source */
export type PreferenceSource = 'stated' | 'learned' | 'pms';

/** Knowledge base categories */
export type KnowledgeCategory = 'faq' | 'policy' | 'amenity' | 'menu' | 'local' | 'service';

/** Automation trigger types */
export type AutomationTriggerType = 'time_based' | 'event_based' | 'condition_based';

/** Automation action types */
export type AutomationActionType = 'send_message' | 'create_task' | 'notify_staff';

/** Audit actor types */
export type AuditActorType = 'staff' | 'system' | 'guest';

/** Dead letter queue item status */
export type DeadLetterStatus = 'pending' | 'retrying' | 'resolved' | 'abandoned';

// =============================================================================
// CORE TABLES
// =============================================================================

/**
 * Global settings for the hotel instance.
 * Key-value store for configuration.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * Guest profiles with preferences and history.
 * PMS-agnostic: uses internal IDs with external_ids for PMS mapping.
 */
export const guests = sqliteTable('guests', {
  id: text('id').primaryKey(), // UUID: guest_xxxxx

  // Identity
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),

  // Profile
  language: text('language').default('en'), // ISO 639-1
  loyaltyTier: text('loyalty_tier').$type<LoyaltyTier>(),
  vipStatus: text('vip_status'),

  // External system references (PMS-agnostic)
  // JSON: { "pms": "OPERA-12345", "loyalty": "MR98765", "crm": "SF-001" }
  externalIds: text('external_ids').notNull().default('{}'),

  // Preferences (learned and stated)
  // JSON array: [{ category, key, value, source, confidence, updatedAt }]
  preferences: text('preferences').notNull().default('[]'),

  // Aggregated stats (denormalized for quick access)
  stayCount: integer('stay_count').notNull().default(0),
  totalRevenue: real('total_revenue').notNull().default(0),
  lastStayDate: text('last_stay_date'), // YYYY-MM-DD

  // Notes and tags
  notes: text('notes'),
  tags: text('tags').default('[]'), // JSON array: ["vip", "business"]

  // Timestamps
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex('idx_guests_email').on(table.email),
  uniqueIndex('idx_guests_phone').on(table.phone),
  index('idx_guests_name').on(table.lastName, table.firstName),
]);

/**
 * Reservation records synced from PMS.
 * Stores booking details for current and past stays.
 */
export const reservations = sqliteTable('reservations', {
  id: text('id').primaryKey(), // UUID: res_xxxxx
  guestId: text('guest_id').notNull().references(() => guests.id),

  // Identity
  confirmationNumber: text('confirmation_number').notNull().unique(),
  externalId: text('external_id'), // PMS reservation ID

  // Stay details
  roomNumber: text('room_number'),
  roomType: text('room_type').notNull(),
  arrivalDate: text('arrival_date').notNull(), // YYYY-MM-DD
  departureDate: text('departure_date').notNull(), // YYYY-MM-DD

  // Status
  status: text('status').notNull().default('confirmed').$type<ReservationStatus>(),

  // Timing (ISO 8601 datetime)
  estimatedArrival: text('estimated_arrival'),
  actualArrival: text('actual_arrival'),
  estimatedDeparture: text('estimated_departure'),
  actualDeparture: text('actual_departure'),

  // Financial
  rateCode: text('rate_code'),
  totalRate: real('total_rate'),
  balance: real('balance').default(0),

  // Additional info (JSON arrays)
  specialRequests: text('special_requests').default('[]'),
  notes: text('notes').default('[]'),

  // Sync tracking
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),

  // Timestamps
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_reservations_guest').on(table.guestId),
  index('idx_reservations_dates').on(table.arrivalDate, table.departureDate),
  index('idx_reservations_status').on(table.status),
  index('idx_reservations_room').on(table.roomNumber),
]);

/**
 * Staff/employee records for the hotel.
 */
export const staff = sqliteTable('staff', {
  id: text('id').primaryKey(), // UUID: staff_xxxxx

  // Identity
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  phone: text('phone'),

  // Role and department
  role: text('role').notNull().$type<StaffRole>(),
  department: text('department'),

  // Permissions (JSON array of permission strings)
  // e.g., ["guest.view", "conversation.respond", "task.complete"]
  permissions: text('permissions').notNull().default('[]'),

  // Status
  status: text('status').notNull().default('active').$type<StaffStatus>(),
  lastActiveAt: text('last_active_at'),

  // Authentication (bcrypt hash)
  passwordHash: text('password_hash'),

  // Timestamps
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_staff_role').on(table.role),
  index('idx_staff_department').on(table.department),
]);

/**
 * Guest communication threads.
 * One conversation per guest per channel session.
 */
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(), // UUID: conv_xxxxx
  guestId: text('guest_id').references(() => guests.id),
  reservationId: text('reservation_id').references(() => reservations.id),

  // Channel info
  channelType: text('channel_type').notNull().$type<ChannelType>(),
  channelId: text('channel_id').notNull(), // Phone, email, or session ID

  // State management
  state: text('state').notNull().default('active').$type<ConversationState>(),
  assignedTo: text('assigned_to').references(() => staff.id),

  // AI context
  currentIntent: text('current_intent'),
  metadata: text('metadata').notNull().default('{}'), // JSON object

  // Timing
  lastMessageAt: text('last_message_at'),
  resolvedAt: text('resolved_at'),
  idleWarnedAt: text('idle_warned_at'), // When "are you still there?" was sent

  // Timestamps
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_conversations_guest').on(table.guestId),
  index('idx_conversations_channel').on(table.channelType, table.channelId),
  index('idx_conversations_state').on(table.state),
  index('idx_conversations_assigned').on(table.assignedTo),
]);

/**
 * Individual messages within conversations.
 */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(), // UUID: msg_xxxxx
  conversationId: text('conversation_id').notNull().references(() => conversations.id),

  // Direction and sender
  direction: text('direction').notNull().$type<MessageDirection>(),
  senderType: text('sender_type').notNull().$type<SenderType>(),
  senderId: text('sender_id'), // Staff ID if senderType = 'staff'

  // Content
  content: text('content').notNull(),
  contentType: text('content_type').notNull().default('text').$type<ContentType>(),
  // Media attachments as JSON array
  // [{ type: "image", url: "...", mimeType: "image/jpeg", size: 12345 }]
  media: text('media'),

  // AI metadata
  intent: text('intent'),
  confidence: real('confidence'),
  entities: text('entities'), // JSON: [{ type, value, confidence }]
  sentiment: text('sentiment'), // positive, neutral, negative
  language: text('language'), // Detected language ISO code

  // Channel-specific
  channelMessageId: text('channel_message_id'), // External message ID
  deliveryStatus: text('delivery_status').default('sent').$type<DeliveryStatus>(),
  deliveryError: text('delivery_error'),
  deliveredAt: text('delivered_at'),
  readAt: text('read_at'),

  // Timestamp
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_messages_conversation').on(table.conversationId),
  index('idx_messages_created').on(table.conversationId, table.createdAt),
  index('idx_messages_channel_id').on(table.channelMessageId),
]);

/**
 * Service requests and work orders.
 * Created from guest requests or manually by staff.
 */
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(), // UUID: task_xxxxx
  conversationId: text('conversation_id').references(() => conversations.id),
  guestId: text('guest_id').references(() => guests.id),

  // Type and department
  type: text('type').notNull().$type<TaskType>(),
  department: text('department').notNull(),

  // Details
  roomNumber: text('room_number'),
  description: text('description').notNull(),
  items: text('items'), // JSON: [{ item: "towels", quantity: 2 }]

  // Priority and status
  priority: text('priority').notNull().default('standard').$type<TaskPriority>(),
  status: text('status').notNull().default('pending').$type<TaskStatus>(),
  assignedTo: text('assigned_to').references(() => staff.id),

  // External system reference (if synced to housekeeping/maintenance system)
  externalId: text('external_id'),
  externalSystem: text('external_system'),

  // SLA tracking
  dueAt: text('due_at'),
  slaResponseDeadline: text('sla_response_deadline'),
  slaResolutionDeadline: text('sla_resolution_deadline'),

  // Timing
  assignedAt: text('assigned_at'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),

  // Notes
  notes: text('notes'),
  completionNotes: text('completion_notes'),

  // Timestamps
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_tasks_conversation').on(table.conversationId),
  index('idx_tasks_guest').on(table.guestId),
  index('idx_tasks_status').on(table.status),
  index('idx_tasks_department').on(table.department, table.status),
  index('idx_tasks_assigned').on(table.assignedTo),
  index('idx_tasks_room').on(table.roomNumber),
  index('idx_tasks_priority').on(table.priority, table.status),
]);

// =============================================================================
// KNOWLEDGE BASE & RAG
// =============================================================================

/**
 * Property-specific knowledge for RAG retrieval.
 * FAQs, policies, amenity info, menus, local recommendations.
 */
export const knowledgeBase = sqliteTable('knowledge_base', {
  id: text('id').primaryKey(), // UUID: kb_xxxxx

  // Classification
  category: text('category').notNull().$type<KnowledgeCategory>(),
  title: text('title').notNull(),
  content: text('content').notNull(),

  // Search helpers
  keywords: text('keywords').default('[]'), // JSON array for fallback search

  // Status
  status: text('status').notNull().default('active'), // active, draft, archived

  // Versioning
  version: integer('version').notNull().default(1),
  previousVersionId: text('previous_version_id'),

  // Timestamps
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by').references(() => staff.id),
  updatedBy: text('updated_by').references(() => staff.id),
}, (table) => [
  index('idx_knowledge_category').on(table.category),
  index('idx_knowledge_status').on(table.status),
]);

/**
 * Knowledge base version history for rollback support.
 */
export const knowledgeVersions = sqliteTable('knowledge_versions', {
  id: text('id').primaryKey(), // UUID: kv_xxxxx
  knowledgeId: text('knowledge_id').notNull().references(() => knowledgeBase.id),

  version: integer('version').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),

  changeDescription: text('change_description'),
  createdBy: text('created_by').references(() => staff.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_knowledge_versions_knowledge').on(table.knowledgeId),
]);

/**
 * Learned knowledge from conversations.
 * Questions that staff answered which Jack couldn't handle.
 */
export const learnedKnowledge = sqliteTable('learned_knowledge', {
  id: text('id').primaryKey(), // UUID: lk_xxxxx

  question: text('question').notNull(),
  answer: text('answer').notNull(),

  // Tracking
  occurrences: integer('occurrences').notNull().default(1),
  lastOccurrence: text('last_occurrence').notNull().default(sql`(datetime('now'))`),

  // Approval status
  status: text('status').notNull().default('suggested'), // suggested, approved, rejected
  approvedBy: text('approved_by').references(() => staff.id),
  approvedAt: text('approved_at'),

  // If promoted to knowledge base
  knowledgeBaseId: text('knowledge_base_id').references(() => knowledgeBase.id),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_learned_knowledge_status').on(table.status),
]);

// =============================================================================
// AUTOMATION & SCHEDULING
// =============================================================================

/**
 * Configured automation rules for proactive messaging and task creation.
 */
export const automationRules = sqliteTable('automation_rules', {
  id: text('id').primaryKey(), // UUID: auto_xxxxx

  // Identity
  name: text('name').notNull(),
  description: text('description'),

  // Trigger configuration
  triggerType: text('trigger_type').notNull().$type<AutomationTriggerType>(),
  // JSON config varies by type:
  // time_based: { type: "pre_arrival", offsetDays: -3, time: "10:00" }
  // event_based: { event: "check_in", delay: "2h" }
  // condition_based: { condition: "guest.loyaltyTier == 'platinum'" }
  triggerConfig: text('trigger_config').notNull(),

  // Action configuration
  actionType: text('action_type').notNull().$type<AutomationActionType>(),
  // JSON config varies by type:
  // send_message: { template: "welcome", channel: "whatsapp" }
  // create_task: { type: "housekeeping", department: "housekeeping" }
  // notify_staff: { role: "concierge", message: "VIP arriving" }
  actionConfig: text('action_config').notNull(),

  // Status
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

  // Timestamps
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_automation_enabled').on(table.enabled),
  index('idx_automation_trigger').on(table.triggerType),
]);

/**
 * Scheduled job tracking.
 * Tracks automation executions and scheduled tasks.
 */
export const scheduledJobs = sqliteTable('scheduled_jobs', {
  id: text('id').primaryKey(), // UUID: job_xxxxx

  // Reference
  automationRuleId: text('automation_rule_id').references(() => automationRules.id),
  targetType: text('target_type').notNull(), // guest, reservation, conversation
  targetId: text('target_id').notNull(),

  // Scheduling
  scheduledFor: text('scheduled_for').notNull(), // ISO datetime
  status: text('status').notNull().default('pending'), // pending, running, completed, failed, cancelled

  // Execution
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  error: text('error'),
  result: text('result'), // JSON

  // Retry tracking
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  nextRetryAt: text('next_retry_at'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_scheduled_jobs_status').on(table.status),
  index('idx_scheduled_jobs_scheduled').on(table.scheduledFor),
  index('idx_scheduled_jobs_target').on(table.targetType, table.targetId),
]);

// =============================================================================
// AUDIT & COMPLIANCE
// =============================================================================

/**
 * Audit log for compliance and debugging.
 * Tracks significant actions across the system.
 */
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(), // UUID: audit_xxxxx

  // Actor
  actorType: text('actor_type').notNull().$type<AuditActorType>(),
  actorId: text('actor_id'),

  // Action
  action: text('action').notNull(), // e.g., "guest.view", "task.complete"
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),

  // Details
  details: text('details'), // JSON with action-specific data
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_audit_created').on(table.createdAt),
  index('idx_audit_actor').on(table.actorType, table.actorId),
  index('idx_audit_resource').on(table.resourceType, table.resourceId),
  index('idx_audit_action').on(table.action),
]);

/**
 * Dead letter queue for failed operations.
 * Used for PMS sync failures, message delivery failures, etc.
 */
export const deadLetterQueue = sqliteTable('dead_letter_queue', {
  id: text('id').primaryKey(), // UUID: dlq_xxxxx

  // Operation details
  operation: text('operation').notNull(), // e.g., "pms.postCharge", "channel.send"
  payload: text('payload').notNull(), // JSON

  // Error information
  errorMessage: text('error_message').notNull(),
  errorCode: text('error_code'),
  errorStack: text('error_stack'),

  // Tracking
  attempts: integer('attempts').notNull().default(1),
  firstAttemptAt: text('first_attempt_at').notNull().default(sql`(datetime('now'))`),
  lastAttemptAt: text('last_attempt_at').notNull().default(sql`(datetime('now'))`),

  // Status
  status: text('status').notNull().default('pending').$type<DeadLetterStatus>(),
  resolvedBy: text('resolved_by').references(() => staff.id),
  resolvedAt: text('resolved_at'),
  resolutionNotes: text('resolution_notes'),

  // Metadata
  metadata: text('metadata'), // JSON with context

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_dlq_status').on(table.status),
  index('idx_dlq_operation').on(table.operation),
  index('idx_dlq_created').on(table.createdAt),
]);

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/**
 * Notification records for staff.
 * Push notifications, dashboard alerts, SMS/email notifications.
 */
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(), // UUID: notif_xxxxx

  // Recipient
  recipientId: text('recipient_id').notNull().references(() => staff.id),

  // Content
  title: text('title').notNull(),
  body: text('body').notNull(),
  priority: text('priority').notNull().default('normal'), // critical, high, normal

  // Related entity
  resourceType: text('resource_type'), // conversation, task, etc.
  resourceId: text('resource_id'),
  actionUrl: text('action_url'),

  // Delivery
  channels: text('channels').notNull().default('["dashboard"]'), // JSON array
  deliveredVia: text('delivered_via'), // JSON array of channels actually delivered

  // Status
  readAt: text('read_at'),
  dismissedAt: text('dismissed_at'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_notifications_recipient').on(table.recipientId),
  index('idx_notifications_unread').on(table.recipientId, table.readAt),
]);

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Rate limit tracking.
 * Sliding window counters for API and message rate limits.
 */
export const rateLimitEntries = sqliteTable('rate_limit_entries', {
  id: text('id').primaryKey(),

  // Key pattern: scope:identifier (e.g., "guest:guest_123", "api:192.168.1.1")
  key: text('key').notNull(),
  timestamp: integer('timestamp').notNull(), // Unix timestamp in ms

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_rate_limit_key').on(table.key),
  index('idx_rate_limit_timestamp').on(table.key, table.timestamp),
]);

// =============================================================================
// SESSIONS & AUTH
// =============================================================================

/**
 * Staff authentication sessions.
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // JWT jti claim
  staffId: text('staff_id').notNull().references(() => staff.id),

  // Token info
  tokenHash: text('token_hash').notNull(), // Hash of the JWT for validation
  expiresAt: text('expires_at').notNull(),

  // Device/client info
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  deviceId: text('device_id'),

  // Status
  revokedAt: text('revoked_at'),
  revokedReason: text('revoked_reason'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  lastUsedAt: text('last_used_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_sessions_staff').on(table.staffId),
  index('idx_sessions_expires').on(table.expiresAt),
]);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/** Inferred types from schema for use in application code */
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

export type KnowledgeBaseEntry = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeBaseEntry = typeof knowledgeBase.$inferInsert;

export type AutomationRule = typeof automationRules.$inferSelect;
export type NewAutomationRule = typeof automationRules.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// =============================================================================
// JSON FIELD TYPES
// =============================================================================

/** Structure for guest preferences stored in JSON */
export interface GuestPreference {
  category: string; // room, dining, communication, etc.
  key: string; // floor, pillow, dietary, etc.
  value: string;
  source: PreferenceSource;
  confidence?: number; // 0-1 for learned preferences
  updatedAt?: string;
}

/** Structure for external ID mapping */
export interface ExternalIds {
  pms?: string;
  loyalty?: string;
  crm?: string;
  [key: string]: string | undefined;
}

/** Structure for task items */
export interface TaskItem {
  item: string;
  quantity: number;
  notes?: string;
}

/** Structure for message media attachments */
export interface MediaAttachment {
  type: 'image' | 'audio' | 'video' | 'document';
  url: string;
  mimeType: string;
  size?: number;
  filename?: string;
}

/** Structure for message entities */
export interface MessageEntity {
  type: string; // quantity, room_number, date, time, etc.
  value: unknown;
  confidence: number;
}
