CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`permissions` text DEFAULT '[]' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE INDEX `idx_roles_name` ON `roles` (`name`);--> statement-breakpoint
ALTER TABLE `staff` ADD `role_id` text REFERENCES roles(id);--> statement-breakpoint
CREATE INDEX `idx_staff_role_id` ON `staff` (`role_id`);