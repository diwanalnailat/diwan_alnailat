CREATE TABLE "nl_task_approvals" (
	"task_id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_hold" integer DEFAULT 0 NOT NULL,
	"snapshot" text DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "nl_task_approval_hold" CHECK ("nl_task_approvals"."payment_hold" IN (0,1)),
	CONSTRAINT "nl_task_approval_status" CHECK ("nl_task_approvals"."status" IN ('pending','approved','on_hold','finance','clarification'))
);
--> statement-breakpoint
ALTER TABLE "nl_task_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nl_task_approvals" ADD CONSTRAINT "nl_task_approvals_task_id_nl_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."nl_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nl_task_approvals" ADD CONSTRAINT "nl_task_approvals_project_id_nl_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."nl_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nl_task_approvals" ADD CONSTRAINT "nl_task_approvals_committee_id_nl_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."nl_committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nl_task_approvals_project" ON "nl_task_approvals" USING btree ("project_id","task_id");--> statement-breakpoint
CREATE INDEX "nl_task_approvals_committee" ON "nl_task_approvals" USING btree ("committee_id","task_id");--> statement-breakpoint
CREATE INDEX "nl_task_approvals_status" ON "nl_task_approvals" USING btree ("status","task_id");
--> statement-breakpoint
REVOKE ALL ON TABLE public.nl_task_approvals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nl_task_approvals TO service_role;
