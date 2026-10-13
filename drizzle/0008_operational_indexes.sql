CREATE INDEX `nl_audit_resource_entity_created` ON `nl_audit` (`resource`,`entity_id`,`created`);--> statement-breakpoint
-- Drizzle's SQLite generator splits the comma inside this SQL expression.
-- Keep json_extract as an expression, matching the schema and snapshot.
CREATE INDEX `nl_expenses_project_task` ON `nl_expenses` (`project_id`,json_extract(meta,'$.task_id'));--> statement-breakpoint
CREATE INDEX `nl_files_type_created` ON `nl_files` (`entity_type`,`created`);
