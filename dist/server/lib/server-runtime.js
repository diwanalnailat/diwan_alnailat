import "server-only";
import { postgresDatabase } from "./postgres.js";
import { supabaseStorage, joinAttachmentStorage } from "./supabase-storage.js";
let database;
const developmentDatabase = Symbol.for("diwan.development.database");
export async function serverEnvironment() {
  // Keep the pool across Next development reloads instead of reconnecting on edits.
  if (process.env.NODE_ENV === "development")
    database ||= globalThis[developmentDatabase];
  database ||= postgresDatabase(process.env.DATABASE_URL).catch((error) => {
    database = undefined;
    if (process.env.NODE_ENV === "development")
      delete globalThis[developmentDatabase];
    throw error;
  });
  if (process.env.NODE_ENV === "development")
    globalThis[developmentDatabase] = database;
  return {
    ...process.env,
    DB: await database,
    BUCKET: supabaseStorage(process.env),
    JOIN_BUCKET: joinAttachmentStorage(process.env),
    DIWAN_RUNTIME: "vercel_whatsapp",
  };
}
