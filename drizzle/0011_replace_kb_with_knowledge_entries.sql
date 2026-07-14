DROP TABLE `kb_chunks`;--> statement-breakpoint
DROP TABLE `kb_documents`;--> statement-breakpoint
CREATE TABLE `knowledge_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`embedding` blob,
	`topic` text,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_entries_topic_status_idx` ON `knowledge_entries` (`topic`,`status`);
