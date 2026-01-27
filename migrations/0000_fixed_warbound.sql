CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text,
	`reservation_id` text,
	`channel_type` text NOT NULL,
	`channel_id` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`assigned_to` text,
	`current_intent` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`last_message_at` text,
	`resolved_at` text,
	`idle_warned_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_guest` ON `conversations` (`guest_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_channel` ON `conversations` (`channel_type`,`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_state` ON `conversations` (`state`);--> statement-breakpoint
CREATE INDEX `idx_conversations_assigned` ON `conversations` (`assigned_to`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`phone` text,
	`language` text DEFAULT 'en',
	`loyalty_tier` text,
	`vip_status` text,
	`external_ids` text DEFAULT '{}' NOT NULL,
	`preferences` text DEFAULT '[]' NOT NULL,
	`stay_count` integer DEFAULT 0 NOT NULL,
	`total_revenue` real DEFAULT 0 NOT NULL,
	`last_stay_date` text,
	`notes` text,
	`tags` text DEFAULT '[]',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guests_email` ON `guests` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guests_phone` ON `guests` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_guests_name` ON `guests` (`last_name`,`first_name`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`direction` text NOT NULL,
	`sender_type` text NOT NULL,
	`sender_id` text,
	`content` text NOT NULL,
	`content_type` text DEFAULT 'text' NOT NULL,
	`media` text,
	`intent` text,
	`confidence` real,
	`entities` text,
	`channel_message_id` text,
	`delivery_status` text DEFAULT 'sent',
	`delivery_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_created` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_channel_id` ON `messages` (`channel_message_id`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text NOT NULL,
	`confirmation_number` text NOT NULL,
	`external_id` text,
	`room_number` text,
	`room_type` text NOT NULL,
	`arrival_date` text NOT NULL,
	`departure_date` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`estimated_arrival` text,
	`actual_arrival` text,
	`estimated_departure` text,
	`actual_departure` text,
	`rate_code` text,
	`total_rate` real,
	`balance` real DEFAULT 0,
	`special_requests` text DEFAULT '[]',
	`notes` text DEFAULT '[]',
	`synced_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_confirmation_number_unique` ON `reservations` (`confirmation_number`);--> statement-breakpoint
CREATE INDEX `idx_reservations_guest` ON `reservations` (`guest_id`);--> statement-breakpoint
CREATE INDEX `idx_reservations_dates` ON `reservations` (`arrival_date`,`departure_date`);--> statement-breakpoint
CREATE INDEX `idx_reservations_status` ON `reservations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reservations_room` ON `reservations` (`room_number`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`role` text NOT NULL,
	`department` text,
	`permissions` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_active_at` text,
	`password_hash` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_email_unique` ON `staff` (`email`);--> statement-breakpoint
CREATE INDEX `idx_staff_role` ON `staff` (`role`);--> statement-breakpoint
CREATE INDEX `idx_staff_department` ON `staff` (`department`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`type` text NOT NULL,
	`department` text NOT NULL,
	`room_number` text,
	`description` text NOT NULL,
	`items` text,
	`priority` text DEFAULT 'standard' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`assigned_to` text,
	`external_id` text,
	`external_system` text,
	`due_at` text,
	`started_at` text,
	`completed_at` text,
	`notes` text,
	`completion_notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_conversation` ON `tasks` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_department` ON `tasks` (`department`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_assigned` ON `tasks` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `idx_tasks_room` ON `tasks` (`room_number`);