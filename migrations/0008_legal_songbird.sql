ALTER TABLE `conversations` ADD `guest_language` text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE `messages` ADD `detected_language` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `translated_content` text;