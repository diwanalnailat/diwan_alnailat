CREATE TABLE `nl_join_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`reason` text NOT NULL,
	`committee_id` text,
	`status` text DEFAULT 'verifying' NOT NULL,
	`assigned_to` text,
	`member_id` text,
	`decided_by` text,
	`policy_version` integer NOT NULL,
	`policy_snapshot` text NOT NULL,
	`consent_at` text NOT NULL,
	`verified_at` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `nl_committees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `nl_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `nl_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `nl_members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "nl_join_status" CHECK("nl_join_requests"."status" IN ('verifying','pending','referred','approved','rejected')),
	CONSTRAINT "nl_join_verified" CHECK("nl_join_requests"."status"='verifying' OR "nl_join_requests"."verified_at" IS NOT NULL),
	CONSTRAINT "nl_join_referral" CHECK("nl_join_requests"."status"<>'referred' OR ("nl_join_requests"."assigned_to" IS NOT NULL AND "nl_join_requests"."committee_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `nl_join_assigned_status` ON `nl_join_requests` (`assigned_to`,`status`);--> statement-breakpoint
CREATE INDEX `nl_join_committee` ON `nl_join_requests` (`committee_id`);--> statement-breakpoint
CREATE INDEX `nl_join_created` ON `nl_join_requests` (`created`);--> statement-breakpoint
CREATE UNIQUE INDEX `nl_join_pending_phone` ON `nl_join_requests` (`phone`) WHERE "nl_join_requests"."status" IN ('pending','referred');