CREATE TABLE `admission_application_records` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`intake_id` text NOT NULL,
	`applicant_email` text NOT NULL,
	`applicant_first_name` text DEFAULT '' NOT NULL,
	`applicant_last_name` text DEFAULT '' NOT NULL,
	`date_of_birth` text DEFAULT '' NOT NULL,
	`guardian_name` text DEFAULT '' NOT NULL,
	`guardian_email` text DEFAULT '' NOT NULL,
	`guardian_phone` text DEFAULT '' NOT NULL,
	`previous_school` text DEFAULT '' NOT NULL,
	`desired_class` text DEFAULT '' NOT NULL,
	`support_needs` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admission_records_tenant_intake_email_unique` ON `admission_application_records` (`tenant_id`,`intake_id`,`applicant_email`);--> statement-breakpoint
CREATE INDEX `admission_records_tenant_status_idx` ON `admission_application_records` (`tenant_id`,`status`);