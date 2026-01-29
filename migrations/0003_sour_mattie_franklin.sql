CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`details` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_log` (`actor_type`,`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_resource` ON `audit_log` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE TABLE `response_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`query_hash` text NOT NULL,
	`query` text NOT NULL,
	`response` text NOT NULL,
	`intent` text,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`last_hit_at` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_cache_query_hash_unique` ON `response_cache` (`query_hash`);--> statement-breakpoint
CREATE INDEX `idx_response_cache_hash` ON `response_cache` (`query_hash`);--> statement-breakpoint
CREATE INDEX `idx_response_cache_expires` ON `response_cache` (`expires_at`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_tasks_priority` ON `tasks` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_tasks_source` ON `tasks` (`source`);--> statement-breakpoint
CREATE INDEX `idx_tasks_created` ON `tasks` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_reservation` ON `conversations` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_last_message` ON `conversations` (`last_message_at`);