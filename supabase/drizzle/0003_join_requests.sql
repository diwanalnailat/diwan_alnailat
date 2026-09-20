-- New membership requests remain private; only the trusted server can access them.
CREATE TABLE "nl_join_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"reason" text NOT NULL,
	"committee_id" text,
	"status" text DEFAULT 'verifying' NOT NULL,
	"assigned_to" text,
	"member_id" text,
	"decided_by" text,
	"policy_version" integer NOT NULL,
	"policy_snapshot" text NOT NULL,
	"consent_at" text NOT NULL,
	"verified_at" text,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "nl_join_status" CHECK ("nl_join_requests"."status" IN ('verifying','pending','referred','approved','rejected')),
	CONSTRAINT "nl_join_verified" CHECK ("nl_join_requests"."status"='verifying' OR "nl_join_requests"."verified_at" IS NOT NULL),
	CONSTRAINT "nl_join_referral" CHECK ("nl_join_requests"."status"<>'referred' OR ("nl_join_requests"."assigned_to" IS NOT NULL AND "nl_join_requests"."committee_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "nl_join_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nl_join_requests" ADD CONSTRAINT "nl_join_requests_committee_id_nl_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."nl_committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nl_join_requests" ADD CONSTRAINT "nl_join_requests_assigned_to_nl_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."nl_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nl_join_requests" ADD CONSTRAINT "nl_join_requests_member_id_nl_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."nl_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nl_join_requests" ADD CONSTRAINT "nl_join_requests_decided_by_nl_members_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."nl_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nl_join_assigned_status" ON "nl_join_requests" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "nl_join_committee" ON "nl_join_requests" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "nl_join_created" ON "nl_join_requests" USING btree ("created");--> statement-breakpoint
CREATE UNIQUE INDEX "nl_join_pending_phone" ON "nl_join_requests" USING btree ("phone") WHERE "nl_join_requests"."status" IN ('pending','referred');

REVOKE ALL ON TABLE public.nl_join_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nl_join_requests TO service_role;
