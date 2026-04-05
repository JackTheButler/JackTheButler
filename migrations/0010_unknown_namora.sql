CREATE TABLE `guest_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text NOT NULL,
	`conversation_id` text,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`source` text DEFAULT 'ai_extracted' NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`embedding` blob,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_reinforced_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_guest_memories_guest` ON `guest_memories` (`guest_id`);--> statement-breakpoint
CREATE INDEX `idx_guest_memories_category` ON `guest_memories` (`guest_id`,`category`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_knowledge_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`embedding` blob NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `knowledge_base`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DELETE FROM `knowledge_embeddings`;--> statement-breakpoint
DROP TABLE `knowledge_embeddings`;--> statement-breakpoint
ALTER TABLE `__new_knowledge_embeddings` RENAME TO `knowledge_embeddings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;