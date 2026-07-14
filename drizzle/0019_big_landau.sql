CREATE TABLE `conversation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_agent_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_agent_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conv_events_conversation_created_idx` ON `conversation_events` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `conv_events_episode_idx` ON `conversation_events` (`episode_id`);--> statement-breakpoint
CREATE INDEX `conv_events_type_created_idx` ON `conversation_events` (`type`,`created_at`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer NOT NULL,
	`opened_via` text NOT NULL,
	`first_response_at` integer,
	`first_response_agent_id` text,
	`closed_by_agent_id` text,
	`handed_off` integer DEFAULT false NOT NULL,
	`ai_deflected` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`first_response_agent_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by_agent_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `episodes_closed_at_idx` ON `episodes` (`closed_at`);--> statement-breakpoint
CREATE INDEX `episodes_closed_by_idx` ON `episodes` (`closed_by_agent_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `episodes_conversation_idx` ON `episodes` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `current_episode_id` text;