PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_webchat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`conversation_id` text,
	`guest_id` text,
	`reservation_id` text,
	`verification_status` text DEFAULT 'anonymous' NOT NULL,
	`verification_attempts` integer DEFAULT 0 NOT NULL,
	`verification_code` text,
	`verification_code_expires_at` text,
	`expires_at` text NOT NULL,
	`last_activity_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_webchat_sessions`("id", "token", "conversation_id", "guest_id", "reservation_id", "verification_status", "verification_attempts", "verification_code", "verification_code_expires_at", "expires_at", "last_activity_at", "created_at") SELECT "id", "token", "conversation_id", "guest_id", "reservation_id", "verification_status", "verification_attempts", "verification_code", "verification_code_expires_at", "expires_at", "last_activity_at", "created_at" FROM `webchat_sessions`;--> statement-breakpoint
DROP TABLE `webchat_sessions`;--> statement-breakpoint
ALTER TABLE `__new_webchat_sessions` RENAME TO `webchat_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_webchat_sessions_token` ON `webchat_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_webchat_sessions_expires` ON `webchat_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_webchat_sessions_conversation` ON `webchat_sessions` (`conversation_id`);