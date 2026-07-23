CREATE TABLE `curriculum_units` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`term` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `units_offering_position_idx` ON `curriculum_units` (`offering_id`,`position`);--> statement-breakpoint
CREATE TABLE `lesson_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`lesson_version_id` text NOT NULL,
	`type` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`ready` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_version_id`) REFERENCES `lesson_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_block_position_idx` ON `lesson_blocks` (`lesson_version_id`,`position`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`learner_person_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`lesson_version` integer NOT NULL,
	`percent` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'in-progress' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`learner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_progress_learner_version_idx` ON `lesson_progress` (`tenant_id`,`learner_person_id`,`lesson_id`,`lesson_version`);--> statement-breakpoint
CREATE TABLE `lesson_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`objectives` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`created_by_person_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_version_number_idx` ON `lesson_versions` (`lesson_id`,`version`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`author_person_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `curriculum_units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lessons_tenant_offering_idx` ON `lessons` (`tenant_id`,`offering_id`,`status`);--> statement-breakpoint
CREATE TABLE `subject_offerings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`class_group_id` text NOT NULL,
	`class_name` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`requirement` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offerings_tenant_class_idx` ON `subject_offerings` (`tenant_id`,`class_group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `offerings_subject_class_year_idx` ON `subject_offerings` (`tenant_id`,`subject_id`,`class_group_id`,`academic_year_id`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_tenant_code_idx` ON `subjects` (`tenant_id`,`code`);--> statement-breakpoint
CREATE TABLE `teacher_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`teacher_person_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_offering_assignment_idx` ON `teacher_assignments` (`tenant_id`,`offering_id`,`teacher_person_id`);