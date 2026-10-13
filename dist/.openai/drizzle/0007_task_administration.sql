CREATE TABLE `nl_task_approvals` (
	`task_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`committee_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_hold` integer DEFAULT 0 NOT NULL,
	`snapshot` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `nl_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `nl_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `nl_committees`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "nl_task_approval_hold" CHECK("nl_task_approvals"."payment_hold" IN (0,1)),
	CONSTRAINT "nl_task_approval_status" CHECK("nl_task_approvals"."status" IN ('pending','approved','on_hold','finance','clarification'))
);
--> statement-breakpoint
CREATE INDEX `nl_task_approvals_project` ON `nl_task_approvals` (`project_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `nl_task_approvals_committee` ON `nl_task_approvals` (`committee_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `nl_task_approvals_status` ON `nl_task_approvals` (`status`,`task_id`);