import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./db/schema.postgres.ts",
  out: "./supabase/drizzle",
  dialect: "postgresql",
});
