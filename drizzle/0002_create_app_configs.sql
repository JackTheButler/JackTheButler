CREATE TABLE `app_configs` (
	`app_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`config` text,
	`updated_at` integer NOT NULL
);
