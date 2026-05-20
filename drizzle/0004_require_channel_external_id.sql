PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` integer NOT NULL,
	`channel` text DEFAULT 'webchat' NOT NULL,
	`channel_external_id` text NOT NULL,
	`customer_id` text,
	`mode` text DEFAULT 'ai' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_agent_id` text,
	`created_at` integer NOT NULL,
	`last_message_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "ref", "channel", "channel_external_id", "customer_id", "mode", "status", "assigned_agent_id", "created_at", "last_message_at") SELECT "id", "ref", "channel", "channel_external_id", "customer_id", "mode", "status", "assigned_agent_id", "created_at", "last_message_at" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_ref_unique` ON `conversations` (`ref`);--> statement-breakpoint
CREATE INDEX `conversations_last_message_at_idx` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_status_idx` ON `conversations` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_channel_external_unique` ON `conversations` (`channel`,`channel_external_id`);--> statement-breakpoint
ALTER TABLE `messages` ADD `event` text;