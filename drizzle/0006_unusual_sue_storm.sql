CREATE TABLE `interactive_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`created_by_person_id` text NOT NULL,
	`title` text NOT NULL,
	`provider` text DEFAULT 'h5p' NOT NULL,
	`content_type` text NOT NULL,
	`launch_url` text,
	`launch_origin` text,
	`package_asset_id` text,
	`fallback_text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activities_tenant_offering_idx` ON `interactive_activities` (`tenant_id`,`offering_id`,`status`);--> statement-breakpoint
CREATE TABLE `interactive_activity_results` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`learner_person_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`lesson_version` integer NOT NULL,
	`verb` text NOT NULL,
	`score_percent` integer,
	`success` integer,
	`completion` integer DEFAULT false NOT NULL,
	`statement_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`learner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_results_learner_idx` ON `interactive_activity_results` (`tenant_id`,`learner_person_id`,`activity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`uploaded_by_person_id` text NOT NULL,
	`kind` text NOT NULL,
	`original_filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`object_key` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`) REFERENCES `subject_offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_object_key_idx` ON `media_assets` (`object_key`);--> statement-breakpoint
CREATE INDEX `media_tenant_offering_idx` ON `media_assets` (`tenant_id`,`offering_id`,`status`);--> statement-breakpoint
ALTER TABLE `lesson_blocks` ADD `config` text DEFAULT '{}' NOT NULL;