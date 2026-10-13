CREATE INDEX "nl_audit_resource_entity_created" ON "nl_audit" USING btree ("resource","entity_id","created");--> statement-breakpoint
CREATE INDEX "nl_expenses_project_task" ON "nl_expenses" USING btree ("project_id",(meta::jsonb->>'task_id'));--> statement-breakpoint
CREATE INDEX "nl_files_type_created" ON "nl_files" USING btree ("entity_type","created");