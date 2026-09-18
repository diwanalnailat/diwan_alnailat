ALTER TABLE `nl_advance_entries` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `nl_advances` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `nl_comments` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `nl_committees` ADD `config` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `nl_files` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `nl_movements` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `nl_suppliers` ADD `meta` text DEFAULT '{}' NOT NULL;