import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { database } from "../scripts/sqlite.mjs";
import { postgresTestDatabase } from "./postgres-support.mjs";

for (const backend of ["sqlite", "postgres"]) {
  test(`${backend} operational migrations preserve rows and index actual cleanup, task-cost and audit queries`, async () => {
    const db =
      backend === "postgres" ? await postgresTestDatabase() : database();
    const execute = async (sql) => {
      if (backend === "sqlite") return db.exec(sql);
      for (const statement of sql
        .replaceAll("--> statement-breakpoint", "")
        .split(";")
        .filter((s) => s.trim()))
        await db.prepare(statement).run();
    };
    try {
      if (backend === "sqlite") {
        for (const name of readdirSync("drizzle")
          .filter((name) => name.endsWith(".sql"))
          .sort()) {
          await db.exec(readFileSync(`drizzle/${name}`, "utf8"));
        }
      }
      // Remove just the new indexes in this isolated database, seed pre-existing
      // data, then apply the additive migration to prove it preserves the rows.
      for (const name of [
        "nl_files_type_created",
        "nl_expenses_project_task",
        "nl_audit_resource_entity_created",
      ])
        await execute(`DROP INDEX ${name}`);
      await db
        .prepare(
          "INSERT INTO nl_projects(id,title,created_by,created) VALUES('project-index','Fixture','fixture','2026-01-01')",
        )
        .run();
      const statements = [];
      for (let i = 0; i < 1000; i++) {
        statements.push(
          db
            .prepare(
              "INSERT INTO nl_expenses(id,project_id,title,category,amount,date,meta,created_by,created) VALUES(?,'project-index','Fixture','general',1,'2026-01-01',?,'fixture','2026-01-01')",
            )
            .bind(`expense-${i}`, JSON.stringify({ task_id: `task-${i}` })),
          db
            .prepare(
              "INSERT INTO nl_files(id,entity_type,entity_id,name,mime,size,object_key,created_by,created) VALUES(?,?,'fixture','fixture','application/octet-stream',1,?,'fixture',?)",
            )
            .bind(
              `file-${i}`,
              i % 10 ? "tasks" : "join_upload",
              `files/fixture-${i}`,
              i < 10 ? "2026-01-01" : "2028-01-01",
            ),
          db
            .prepare(
              "INSERT INTO nl_audit(id,actor,action,resource,entity_id,created) VALUES(?,'fixture','fixture',?,?,'2026-01-01')",
            )
            .bind(
              `audit-${i}`,
              i % 3 ? "tasks" : "task_approvals",
              `task-${i}`,
            ),
        );
      }
      await db.batch(statements);
      const migration =
        backend === "sqlite"
          ? "drizzle/0008_operational_indexes.sql"
          : "supabase/drizzle/0005_operational_indexes.sql";
      await execute(readFileSync(migration, "utf8"));
      await execute("ANALYZE nl_files; ANALYZE nl_expenses; ANALYZE nl_audit;");
      for (const table of ["nl_files", "nl_expenses", "nl_audit"])
        assert.equal(
          (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n,
          1000,
        );
      const queries = [
        [
          "SELECT id,object_key FROM nl_files WHERE entity_type='join_upload' AND created<? ORDER BY created LIMIT 200",
          ["2027-01-01"],
          "nl_files_type_created",
        ],
        [
          "SELECT * FROM nl_expenses WHERE project_id=? AND json_extract(meta,'$.task_id')=?",
          ["project-index", "task-501"],
          "nl_expenses_project_task",
        ],
        [
          "SELECT * FROM nl_audit WHERE resource='task_approvals' AND entity_id=? ORDER BY created DESC LIMIT 100",
          ["task-501"],
          "nl_audit_resource_entity_created",
        ],
      ];
      for (const [query, params, index] of queries) {
        const result = await db
          .prepare(
            (backend === "sqlite" ? "EXPLAIN QUERY PLAN " : "EXPLAIN ") + query,
          )
          .bind(...params)
          .all();
        assert.ok(
          JSON.stringify(result.results).includes(index),
          JSON.stringify({ backend, index, plan: result.results }),
        );
      }
    } finally {
      await db.close();
    }
  });
}
