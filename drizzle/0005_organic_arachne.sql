CREATE TABLE `curriculum_standards` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`code` text NOT NULL,
	`strand` text NOT NULL,
	`sub_strand` text NOT NULL,
	`description` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `standards_offering_code_idx` ON `curriculum_standards` (`tenant_id`,`offering_id`,`code`);--> statement-breakpoint
CREATE INDEX `standards_offering_position_idx` ON `curriculum_standards` (`tenant_id`,`offering_id`,`position`);--> statement-breakpoint
CREATE TABLE `lesson_release_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`available_from` text,
	`available_until` text,
	`prerequisite_lesson_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prerequisite_lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_release_rule_idx` ON `lesson_release_rules` (`tenant_id`,`lesson_id`);--> statement-breakpoint
CREATE INDEX `lesson_prerequisite_lookup_idx` ON `lesson_release_rules` (`tenant_id`,`prerequisite_lesson_id`);--> statement-breakpoint
CREATE TABLE `lesson_standard_links` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`standard_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`standard_id`) REFERENCES `curriculum_standards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_standard_link_idx` ON `lesson_standard_links` (`tenant_id`,`lesson_id`,`standard_id`);--> statement-breakpoint
CREATE INDEX `standard_lesson_lookup_idx` ON `lesson_standard_links` (`tenant_id`,`standard_id`);