-- First, migrate existing staff records to use roleId based on their old role value
-- Map: 'admin' → 'role-admin', 'manager' → 'role-manager', others → 'role-staff'
UPDATE `staff` SET `role_id` = 'role-admin' WHERE `role_id` IS NULL AND LOWER(`role`) = 'admin';--> statement-breakpoint
UPDATE `staff` SET `role_id` = 'role-manager' WHERE `role_id` IS NULL AND LOWER(`role`) = 'manager';--> statement-breakpoint
UPDATE `staff` SET `role_id` = 'role-staff' WHERE `role_id` IS NULL;--> statement-breakpoint

-- Now recreate the staff table without the role column and with role_id as NOT NULL
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`role_id` text NOT NULL,
	`department` text,
	`permissions` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_active_at` text,
	`password_hash` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_staff`("id", "email", "name", "phone", "role_id", "department", "permissions", "status", "last_active_at", "password_hash", "created_at", "updated_at") SELECT "id", "email", "name", "phone", "role_id", "department", "permissions", "status", "last_active_at", "password_hash", "created_at", "updated_at" FROM `staff`;--> statement-breakpoint
DROP TABLE `staff`;--> statement-breakpoint
ALTER TABLE `__new_staff` RENAME TO `staff`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `staff_email_unique` ON `staff` (`email`);--> statement-breakpoint
CREATE INDEX `idx_staff_role_id` ON `staff` (`role_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_department` ON `staff` (`department`);
