CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`type` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_unique` ON `auth_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_staff` ON `auth_tokens` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_type` ON `auth_tokens` (`type`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_token` ON `auth_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_expires` ON `auth_tokens` (`expires_at`);--> statement-breakpoint
ALTER TABLE `staff` ADD `email_verified` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `approval_status` text DEFAULT 'approved' NOT NULL;