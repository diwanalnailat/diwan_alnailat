CREATE TABLE `nl_agent_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`message` text NOT NULL,
	`reply` text NOT NULL,
	`proposal` text DEFAULT '{}' NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nl_agent_member` ON `nl_agent_turns` (`member_id`,`created`);--> statement-breakpoint
CREATE TABLE `nl_contact_preferences` (
	`member_id` text PRIMARY KEY NOT NULL,
	`whatsapp` integer DEFAULT 0 NOT NULL,
	`consent_at` text
);
--> statement-breakpoint
CREATE TABLE `nl_delivery_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nl_delivery_provider` ON `nl_delivery_jobs` (`provider_id`);--> statement-breakpoint
CREATE TABLE `nl_integration_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nl_otp` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`phone` text NOT NULL,
	`hash` text NOT NULL,
	`expires` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'sending' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nl_otp_identity` ON `nl_otp` (`site_id`,`created`);