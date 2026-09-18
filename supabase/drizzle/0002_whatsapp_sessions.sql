CREATE TABLE "nl_sessions" (
	"hash" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"phone" text NOT NULL,
	"expires" bigint NOT NULL,
	"created" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nl_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nl_sessions" ADD CONSTRAINT "nl_sessions_member_id_nl_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."nl_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nl_sessions_member" ON "nl_sessions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "nl_sessions_expiry" ON "nl_sessions" USING btree ("expires");
--> statement-breakpoint
REVOKE ALL ON TABLE public.nl_sessions FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nl_sessions TO service_role;
