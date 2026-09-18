import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { databaseAdapter } from "../lib/postgres.js";

export async function postgresTestDatabase() {
  const db = new PGlite({ parsers: { 20: Number, 1700: Number } });
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
  );
  await db.exec(await fs.readFile("supabase/diwan-initial.sql", "utf8"));
  await db.exec(await fs.readFile("supabase/drizzle/0002_whatsapp_sessions.sql", "utf8"));
  const query = (client) => async (sql, params) => {
    const result = await client.query(sql, params);
    return {
      rows: result.rows,
      count: result.affectedRows ?? result.rows.length,
    };
  };
  return databaseAdapter({
    query: query(db),
    transaction: (callback) =>
      db.transaction((transaction) => callback(query(transaction))),
    close: () => db.close(),
  });
}
