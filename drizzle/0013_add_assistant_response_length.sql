ALTER TABLE `assistant_profile` ADD `response_length` text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
-- Tone 'Concise' was retired in favour of a dedicated Response length control;
-- 'Casual' takes its slot as a voice option. Migrate any existing rows.
UPDATE `assistant_profile` SET `tone` = 'Casual' WHERE `tone` = 'Concise';