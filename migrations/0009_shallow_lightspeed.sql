CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`conversation_id` text,
	`error_message` text,
	`latency_ms` integer,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_log_created` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_activity_log_source` ON `activity_log` (`source`);--> statement-breakpoint
CREATE INDEX `idx_activity_log_status` ON `activity_log` (`status`);