ALTER TABLE `knowledge_entries` RENAME COLUMN `embedding` TO `content_embedding`;--> statement-breakpoint
ALTER TABLE `knowledge_entries` ADD `question_embedding` blob;
