CREATE TABLE `grade_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`period_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`weight_percent` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `grading_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_offering_position_idx` ON `grade_categories` (`period_id`,`offering_id`,`position`);--> statement-breakpoint
CREATE TABLE `grade_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`item_id` text NOT NULL,
	`learner_person_id` text NOT NULL,
	`raw_marks` integer,
	`adjusted_marks` integer,
	`status` text DEFAULT 'missing' NOT NULL,
	`adjustment_reason` text,
	`recorded_by_person_id` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `grade_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`learner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grade_entry_item_learner_idx` ON `grade_entries` (`item_id`,`learner_person_id`);--> statement-breakpoint
CREATE INDEX `grade_entries_learner_idx` ON `grade_entries` (`tenant_id`,`learner_person_id`);--> statement-breakpoint
CREATE TABLE `grade_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`period_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`category_id` text NOT NULL,
	`assessment_id` text,
	`title` text NOT NULL,
	`maximum_marks` integer NOT NULL,
	`due_on` text,
	`status` text DEFAULT 'open' NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `grading_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `grade_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grade_item_offering_position_idx` ON `grade_items` (`period_id`,`offering_id`,`position`);--> statement-breakpoint
CREATE TABLE `gradebook_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`period_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`submitted_by_person_id` text,
	`submitted_at` text,
	`reviewed_by_person_id` text,
	`reviewed_at` text,
	`locked_at` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `grading_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gradebook_period_offering_idx` ON `gradebook_submissions` (`tenant_id`,`period_id`,`offering_id`);--> statement-breakpoint
CREATE TABLE `grading_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`name` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `period_tenant_year_name_idx` ON `grading_periods` (`tenant_id`,`academic_year_id`,`name`);--> statement-breakpoint
CREATE TABLE `grading_scale_bands` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`period_id` text NOT NULL,
	`position` integer NOT NULL,
	`minimum_tenths` integer NOT NULL,
	`maximum_tenths` integer NOT NULL,
	`grade` text NOT NULL,
	`remark` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `grading_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scale_period_position_idx` ON `grading_scale_bands` (`period_id`,`position`);--> statement-breakpoint
CREATE TABLE `report_card_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`report_card_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`overall_average_tenths` integer NOT NULL,
	`attendance_present` integer NOT NULL,
	`attendance_total` integer NOT NULL,
	`conduct` text NOT NULL,
	`class_teacher_comment` text NOT NULL,
	`headteacher_comment` text NOT NULL,
	`promotion_decision` text NOT NULL,
	`next_term_begins_on` text,
	`submitted_at` text,
	`approved_by_person_id` text,
	`approved_at` text,
	`released_at` text,
	`created_by_person_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_card_id`) REFERENCES `report_cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_version_number_idx` ON `report_card_versions` (`report_card_id`,`version`);--> statement-breakpoint
CREATE TABLE `report_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`learner_person_id` text NOT NULL,
	`period_id` text NOT NULL,
	`class_group_id` text NOT NULL,
	`class_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`learner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `grading_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_learner_period_idx` ON `report_cards` (`tenant_id`,`learner_person_id`,`period_id`);--> statement-breakpoint
CREATE TABLE `report_subject_results` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`report_version_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`subject_code` text NOT NULL,
	`subject_name` text NOT NULL,
	`score_tenths` integer NOT NULL,
	`grade` text NOT NULL,
	`remark` text NOT NULL,
	`teacher_comment` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_version_id`) REFERENCES `report_card_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_subject_position_idx` ON `report_subject_results` (`report_version_id`,`position`);