CREATE TABLE `assignment_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`assignment_version` integer NOT NULL,
	`learner_person_id` text NOT NULL,
	`status` text DEFAULT 'not-started' NOT NULL,
	`response_text` text DEFAULT '' NOT NULL,
	`submitted_at` text,
	`marked_by_person_id` text,
	`marked_at` text,
	`total_points` integer,
	`feedback` text,
	`released_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`learner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_assignment_learner_idx` ON `assignment_submissions` (`assignment_id`,`assignment_version`,`learner_person_id`);--> statement-breakpoint
CREATE INDEX `submission_marking_queue_idx` ON `assignment_submissions` (`tenant_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `assignment_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`brief` text NOT NULL,
	`opens_at` text NOT NULL,
	`due_at` text NOT NULL,
	`maximum_points` integer NOT NULL,
	`submission_mode` text NOT NULL,
	`status` text NOT NULL,
	`published_at` text,
	`created_by_person_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_version_number_idx` ON `assignment_versions` (`assignment_id`,`version`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`author_person_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assignments_offering_status_idx` ON `assignments` (`tenant_id`,`offering_id`,`status`);--> statement-breakpoint
CREATE TABLE `attendance_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`attendance_record_id` text NOT NULL,
	`previous_code` text NOT NULL,
	`new_code` text NOT NULL,
	`reason` text NOT NULL,
	`corrected_by_person_id` text NOT NULL,
	`corrected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attendance_record_id`) REFERENCES `attendance_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`corrected_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attendance_corrections_record_idx` ON `attendance_corrections` (`tenant_id`,`attendance_record_id`);--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`session_id` text NOT NULL,
	`learner_person_id` text NOT NULL,
	`code` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`recorded_by_person_id` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`learner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_session_learner_idx` ON `attendance_records` (`session_id`,`learner_person_id`);--> statement-breakpoint
CREATE INDEX `attendance_learner_idx` ON `attendance_records` (`tenant_id`,`learner_person_id`);--> statement-breakpoint
CREATE TABLE `attendance_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`class_group_id` text NOT NULL,
	`session_date` text NOT NULL,
	`mode` text NOT NULL,
	`timetable_entry_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`taken_by_person_id` text NOT NULL,
	`submitted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taken_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_class_date_mode_idx` ON `attendance_sessions` (`tenant_id`,`class_group_id`,`session_date`,`mode`);--> statement-breakpoint
CREATE TABLE `guardian_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`guardian_person_id` text NOT NULL,
	`learner_person_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`issued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`read_at` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guardian_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`learner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guardian_alert_source_idx` ON `guardian_alerts` (`tenant_id`,`guardian_person_id`,`source_type`,`source_id`,`kind`);--> statement-breakpoint
CREATE TABLE `rubric_criteria` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assignment_version_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`maximum_points` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_version_id`) REFERENCES `assignment_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rubric_criterion_position_idx` ON `rubric_criteria` (`assignment_version_id`,`position`);--> statement-breakpoint
CREATE TABLE `rubric_levels` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`points` integer NOT NULL,
	`descriptor` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`criterion_id`) REFERENCES `rubric_criteria`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rubric_level_position_idx` ON `rubric_levels` (`criterion_id`,`position`);--> statement-breakpoint
CREATE TABLE `rubric_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`points` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`marked_by_person_id` text NOT NULL,
	`marked_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `assignment_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`criterion_id`) REFERENCES `rubric_criteria`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rubric_score_submission_criterion_idx` ON `rubric_scores` (`submission_id`,`criterion_id`);--> statement-breakpoint
CREATE TABLE `timetable_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`period_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`class_group_id` text NOT NULL,
	`offering_id` text,
	`teacher_person_id` text,
	`subject_name` text NOT NULL,
	`room` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`substitute_teacher_person_id` text,
	`change_reason` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `timetable_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`substitute_teacher_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `timetable_class_day_idx` ON `timetable_entries` (`tenant_id`,`class_group_id`,`weekday`);--> statement-breakpoint
CREATE INDEX `timetable_teacher_day_idx` ON `timetable_entries` (`tenant_id`,`teacher_person_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `timetable_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`kind` text DEFAULT 'lesson' NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timetable_period_position_idx` ON `timetable_periods` (`tenant_id`,`position`);