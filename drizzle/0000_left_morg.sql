CREATE TABLE `nl_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'quantity' NOT NULL,
	`ownership` text DEFAULT 'owned' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`quantity` integer NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`serial` text,
	`condition` text DEFAULT 'ready' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	CONSTRAINT "nl_asset_quantity_nonnegative" CHECK("nl_assets"."quantity">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nl_asset_serial` ON `nl_assets` (`serial`);--> statement-breakpoint
CREATE TABLE `nl_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`entity_id` text NOT NULL,
	`project_id` text,
	`detail` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nl_audit_created` ON `nl_audit` (`created`);--> statement-breakpoint
CREATE TABLE `nl_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`grants` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nl_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `nl_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `nl_comments_task` ON `nl_comments` (`task_id`);--> statement-breakpoint
CREATE TABLE `nl_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`supplier_id` text,
	`title` text NOT NULL,
	`number` text,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`tax` integer DEFAULT 0 NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `nl_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `nl_suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "nl_expense_amount_positive" CHECK("nl_expenses"."amount">0),
	CONSTRAINT "nl_expense_tax_valid" CHECK("nl_expenses"."tax">=0 AND "nl_expenses"."tax"<="nl_expenses"."amount")
);
--> statement-breakpoint
CREATE INDEX `nl_expenses_project` ON `nl_expenses` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nl_expense_invoice_unique` ON `nl_expenses` (`project_id`,`supplier_id`,`number`);--> statement-breakpoint
CREATE TABLE `nl_files` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nl_files_entity` ON `nl_files` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `nl_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL,
	CONSTRAINT "nl_guard_changed" CHECK("nl_guards"."value"=1)
);
--> statement-breakpoint
CREATE TABLE `nl_guides` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`template_version` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `nl_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `nl_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nl_members` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`grants` text DEFAULT '[]' NOT NULL,
	`bundles` text DEFAULT '[]' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nl_member_site` ON `nl_members` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nl_member_phone` ON `nl_members` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `nl_member_email` ON `nl_members` (`email`);--> statement-breakpoint
CREATE TABLE `nl_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`project_id` text,
	`member_id` text,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `nl_assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `nl_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `nl_members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "nl_movement_positive" CHECK("nl_movements"."quantity">0)
);
--> statement-breakpoint
CREATE INDEX `nl_movement_asset` ON `nl_movements` (`asset_id`);--> statement-breakpoint
CREATE TABLE `nl_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`resource` text NOT NULL,
	`entity_id` text NOT NULL,
	`project_id` text,
	`channel` text DEFAULT 'in_app' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nl_notifications_member` ON `nl_notifications` (`member_id`,`created`);--> statement-breakpoint
CREATE TABLE `nl_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `nl_expenses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "nl_payment_positive" CHECK("nl_payments"."amount">0)
);
--> statement-breakpoint
CREATE INDEX `nl_payments_expense` ON `nl_payments` (`expense_id`);--> statement-breakpoint
CREATE TABLE `nl_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`season` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`start` text,
	`due` text,
	`budget` integer DEFAULT 0 NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	CONSTRAINT "nl_project_budget_nonnegative" CHECK("nl_projects"."budget">=0)
);
--> statement-breakpoint
CREATE TABLE `nl_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`hash` text NOT NULL,
	`result` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nl_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nl_suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`tax_number` text,
	`category` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nl_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`assignee_id` text,
	`start` text,
	`due` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`parent_id` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `nl_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `nl_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `nl_tasks_project_due` ON `nl_tasks` (`project_id`,`due`);--> statement-breakpoint
CREATE INDEX `nl_tasks_assignee` ON `nl_tasks` (`assignee_id`);