PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`name` text NOT NULL,
	`role` text DEFAULT 'agent' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invite_token` text,
	`last_login_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
-- Existing staff predate roles and were effectively full-access → admin/active.
-- New columns not listed (invite_token, last_login_at) default to NULL.
INSERT INTO `__new_staff`("id", "email", "password_hash", "name", "role", "status", "created_at") SELECT "id", "email", "password_hash", "name", 'admin', 'active', "created_at" FROM `staff`;--> statement-breakpoint
DROP TABLE `staff`;--> statement-breakpoint
ALTER TABLE `__new_staff` RENAME TO `staff`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `staff_email_unique` ON `staff` (`email`);