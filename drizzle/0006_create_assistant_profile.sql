CREATE TABLE `assistant_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tone` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`fallback` text NOT NULL,
	`topics_to_avoid` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
