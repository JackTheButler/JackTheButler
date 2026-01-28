CREATE TABLE `automation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`status` text NOT NULL,
	`trigger_data` text,
	`action_result` text,
	`error_message` text,
	`execution_time_ms` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_automation_logs_rule` ON `automation_logs` (`rule_id`);--> statement-breakpoint
CREATE INDEX `idx_automation_logs_status` ON `automation_logs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_automation_logs_created` ON `automation_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`trigger_type` text NOT NULL,
	`trigger_config` text NOT NULL,
	`action_type` text NOT NULL,
	`action_config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`last_error` text,
	`run_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_automation_rules_enabled` ON `automation_rules` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_automation_rules_trigger_type` ON `automation_rules` (`trigger_type`);--> statement-breakpoint
CREATE TABLE `integration_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`last_checked_at` text,
	`last_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_configs_unique` ON `integration_configs` (`integration_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `idx_integration_configs_integration` ON `integration_configs` (`integration_id`);--> statement-breakpoint
CREATE INDEX `idx_integration_configs_status` ON `integration_configs` (`status`);--> statement-breakpoint
CREATE TABLE `integration_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`details` text,
	`error_message` text,
	`latency_ms` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_integration_logs_integration` ON `integration_logs` (`integration_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `idx_integration_logs_event_type` ON `integration_logs` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_integration_logs_created` ON `integration_logs` (`created_at`);