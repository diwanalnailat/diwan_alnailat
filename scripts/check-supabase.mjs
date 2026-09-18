// Read-only check of the actual server database and private attachment bucket.
import { readFile } from "node:fs/promises";
import { postgresDatabase } from "../lib/postgres.js";
import { supabaseStorage } from "../lib/supabase-storage.js";
let db;
try {
  db = await postgresDatabase(process.env.DATABASE_URL);
  const schema = await readFile(
    new URL("../db/schema.postgres.ts", import.meta.url),
    "utf8",
  );
  const names = [...schema.matchAll(/pgTable\(\s*"(nl_[a-z_]+)"/g)].map(
    (match) => match[1],
  );
  const { results } = await db
    .prepare(
      "SELECT c.relname AS name,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'",
    )
    .all();
  const missing = names.filter(
    (name) => !results.some((row) => row.name === name && row.rls),
  );
  if (missing.length)
    throw new Error("Missing table or RLS: " + missing.join(", "));
  const storage = await supabaseStorage(process.env).inspect();
  if (!storage) throw new Error("Private Storage bucket missing");
  console.log(
    JSON.stringify({
      database: "connected",
      tables: names.length,
      rls: true,
      storage: storage.id,
      private: true,
    }),
  );
  console.log(
    "Read-only check; workflow/write verification is recorded separately.",
  );
} catch (error) {
  console.error("Connection check failed: " + (error.code || error.message));
  process.exitCode = 1;
} finally {
  if (db) await db.close();
}
