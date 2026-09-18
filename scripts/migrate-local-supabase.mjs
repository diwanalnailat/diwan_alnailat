// Explicit, non-destructive transfer into an EMPTY cloud workspace.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";
import { supabaseStorage } from "../lib/supabase-storage.js";

const root = process.env.DIWAN_LOCAL_DATA || "/tmp/diwan-local";
const file = path.join(root, "workspace.sqlite");
if (!fs.existsSync(file)) throw new Error("Local workspace not found");
const tables = [
  "nl_settings",
  "nl_members",
  "nl_bundles",
  "nl_projects",
  "nl_committees",
  "nl_tasks",
  "nl_suppliers",
  "nl_expenses",
  "nl_payments",
  "nl_advances",
  "nl_advance_entries",
  "nl_asset_numbers",
  "nl_assets",
  "nl_movements",
  "nl_files",
  "nl_comments",
  "nl_guides",
  "nl_audit",
  "nl_notifications",
  "nl_receipts",
  "nl_guards",
  "nl_agent_turns",
  "nl_otp",
  "nl_contact_preferences",
  "nl_delivery_jobs",
  "nl_integration_limits",
];
const local = new DatabaseSync(file, { readOnly: true });
const remote = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
  connect_timeout: 10,
});
const storage = supabaseStorage(process.env);
try {
  // A consistent local snapshot; the source is never updated or deleted.
  local.exec("BEGIN");
  const records = Object.fromEntries(
    tables.map((table) => [
      table,
      local.prepare(`SELECT * FROM ${table}`).all(),
    ]),
  );
  await remote.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(1748320617)`;
    // Protect against accidental overwrite or a concurrently started application.
    await transaction.unsafe(
      `LOCK TABLE ${tables.join(",")} IN ACCESS EXCLUSIVE MODE`,
    );
    for (const table of tables) {
      const [row] = await transaction.unsafe(
        `SELECT count(*)::int AS n FROM ${table}`,
      );
      if (row.n)
        throw new Error("Cloud workspace is not empty; merge requires review");
    }
    if (!(await storage.inspect()))
      throw new Error("Private Storage bucket missing");
    for (const record of records.nl_files) {
      if (!/^files\/[a-zA-Z0-9-]+$/.test(record.object_key))
        throw new Error("Invalid stored file path");
      const bytes = fs.readFileSync(path.join(root, record.object_key));
      const existing = await storage.get(record.object_key);
      if (existing) {
        if (!bytes.equals(Buffer.from(await existing.arrayBuffer())))
          throw new Error("Existing cloud file differs; source preserved");
      } else {
        await storage.put(record.object_key, bytes, {
          httpMetadata: { contentType: record.mime },
        });
      }
    }
    for (const table of tables) {
      for (const record of records[table]) {
        const columns = Object.keys(record);
        const sql = `INSERT INTO ${table} (${columns.map((column) => '"' + column.replaceAll('"', '""') + '"').join(",")}) VALUES (${columns.map((_, i) => "$" + (i + 1)).join(",")})`;
        await transaction.unsafe(sql, Object.values(record));
      }
    }
    await transaction`SELECT setval('nl_asset_numbers_number_seq', COALESCE((SELECT MAX(number) FROM nl_asset_numbers),1), EXISTS(SELECT 1 FROM nl_asset_numbers))`;
  });
  console.log(
    JSON.stringify({
      migrated: true,
      sourcePreserved: true,
      counts: Object.fromEntries(
        tables.map((table) => [table, records[table].length]),
      ),
    }),
  );
} catch (error) {
  console.error(
    error.code
      ? `Transfer failed (${error.code}); database transaction rolled back`
      : error.message,
  );
  process.exitCode = 1;
} finally {
  local.close();
  await remote.end({ timeout: 5 });
}
