// Explicit setup, never called from an application request handler.
import { supabaseStorage } from "../lib/supabase-storage.js";
const storage = supabaseStorage(process.env);
try {
  if (!(await storage.inspect())) await storage.create();
  const info = await storage.inspect();
  console.log(
    JSON.stringify({
      bucket: info.id,
      private: !info.public,
      maxBytes: info.fileSizeLimit,
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
