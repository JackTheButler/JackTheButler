CREATE TABLE `setup_state` (
	`id` text PRIMARY KEY DEFAULT 'setup' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`current_step` text,
	`completed_steps` text DEFAULT '[]' NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
