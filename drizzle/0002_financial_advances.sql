CREATE TABLE `nl_advance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`advance_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`payment_id` text,
	`reference` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`advance_id`) REFERENCES `nl_advances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `nl_payments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "nl_advance_entry_positive" CHECK("nl_advance_entries"."amount">0)
);
--> statement-breakpoint
CREATE INDEX `nl_advance_entries_advance` ON `nl_advance_entries` (`advance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nl_advance_payment` ON `nl_advance_entries` (`payment_id`);--> statement-breakpoint
CREATE TABLE `nl_advances` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`assignee_id` text NOT NULL,
	`title` text NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `nl_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `nl_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `nl_advances_project` ON `nl_advances` (`project_id`);