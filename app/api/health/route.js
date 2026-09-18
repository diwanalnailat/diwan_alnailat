import { postgresDatabase } from "../../../lib/postgres.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let database;

export async function GET() {
  try {
    database ||= postgresDatabase(process.env.DATABASE_URL).catch((error) => {
      database = undefined;
      throw error;
    });
    const db = await database;
    await db.prepare("SELECT key FROM nl_settings LIMIT 1").first();
    return Response.json(
      { status: "ok", workspace: "closed" },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { status: "unavailable", workspace: "closed" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
