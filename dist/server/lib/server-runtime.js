import "server-only";
import { postgresDatabase } from "./postgres.js";
import { supabaseStorage } from "./supabase-storage.js";
let database;
export async function serverEnvironment() {
  database ||= postgresDatabase(process.env.DATABASE_URL).catch((error) => {
    database = undefined;
    throw error;
  });
  return {
    ...process.env,
    DB: await database,
    BUCKET: supabaseStorage(process.env),
    DIWAN_RUNTIME: "vercel_whatsapp",
  };
}
