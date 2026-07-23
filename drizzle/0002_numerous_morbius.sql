CREATE TABLE `assessment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`assessment_version` integer NOT NULL,
	`learner_person_id` text NOT NULL,
	`status` text DEFAULT 'in-progress' NOT NULL,
	`question_order` text DEFAULT '[]' NOT NULL,
	`started_at` text NOT NULL,
	`deadline_at` text NOT NULL,
	`submitted_at` text,
	`auto_marks` integer DEFAULT 0 NOT NULL,
	`manual_marks` integer DEFAULT 0 NOT NULL,
	`maximum_marks` integer NOT NULL,
	`released_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`learner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempts_learner_assessment_idx` ON `assessment_attempts` (`tenant_id`,`learner_person_id`,`assessment_id`);--> statement-breakpoint
CREATE INDEX `attempts_marking_queue_idx` ON `assessment_attempts` (`tenant_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `assessment_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assessment_version_id` text NOT NULL,
	`question_version_id` text NOT NULL,
	`position` integer NOT NULL,
	`marks` integer NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_version_id`) REFERENCES `assessment_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_version_id`) REFERENCES `question_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_question_position_idx` ON `assessment_questions` (`assessment_version_id`,`position`);--> statement-breakpoint
CREATE TABLE `assessment_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`question_version_id` text NOT NULL,
	`response` text DEFAULT '{}' NOT NULL,
	`flagged` integer DEFAULT false NOT NULL,
	`auto_marks` integer DEFAULT 0 NOT NULL,
	`manual_marks` integer,
	`marking_status` text DEFAULT 'unanswered' NOT NULL,
	`feedback` text,
	`marked_by_person_id` text,
	`marked_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attempt_id`) REFERENCES `assessment_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_version_id`) REFERENCES `question_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_attempt_question_idx` ON `assessment_responses` (`attempt_id`,`question_version_id`);--> statement-breakpoint
CREATE TABLE `assessment_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`purpose` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`time_limit_minutes` integer NOT NULL,
	`pass_mark_percent` integer NOT NULL,
	`attempts_allowed` integer DEFAULT 1 NOT NULL,
	`shuffle_questions` integer DEFAULT false NOT NULL,
	`feedback_policy` text DEFAULT 'after-release' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`created_by_person_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_version_number_idx` ON `assessment_versions` (`assessment_id`,`version`);--> statement-breakpoint
CREATE TABLE `assessments` (
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
CREATE INDEX `assessments_tenant_offering_idx` ON `assessments` (`tenant_id`,`offering_id`,`status`);--> statement-breakpoint
CREATE TABLE `question_bank_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`author_person_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`difficulty` text DEFAULT 'standard' NOT NULL,
	`topic` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `questions_tenant_offering_idx` ON `question_bank_items` (`tenant_id`,`offering_id`,`status`);--> statement-breakpoint
CREATE TABLE `question_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`question_id` text NOT NULL,
	`version` integer NOT NULL,
	`prompt` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`answer_key` text DEFAULT '{}' NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`marks` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by_person_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `question_bank_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_version_number_idx` ON `question_versions` (`question_id`,`version`);