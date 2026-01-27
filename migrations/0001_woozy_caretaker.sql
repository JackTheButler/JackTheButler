CREATE TABLE `knowledge_base` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_category` ON `knowledge_base` (`category`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_status` ON `knowledge_base` (`status`);--> statement-breakpoint
CREATE TABLE `knowledge_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`embedding` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `knowledge_base`(`id`) ON UPDATE no action ON DELETE cascade
);
