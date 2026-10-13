// Explicit setup only; application handlers never create buckets or schema.
import { joinAttachmentStorage } from "../lib/supabase-storage.js";
import { JOIN_STORAGE_MAX_BYTES as JOIN_MAX_BYTES } from "../lib/join-attachment-policy.js";
const storage = joinAttachmentStorage(process.env);
if (!(await storage.inspect()))
  await storage.create({ maxBytes: JOIN_MAX_BYTES, allFormats: true });
const info = await storage.inspect();
if (
  !info ||
  info.public ||
  info.allowedMimeTypes?.length ||
  info.fileSizeLimit !== JOIN_MAX_BYTES
)
  throw new Error(
    "Join attachment bucket configuration differs from the private all-format contract",
  );
console.log(
  JSON.stringify({
    bucket: info.id,
    private: true,
    allFormats: true,
    maxBytes: info.fileSizeLimit,
  }),
);
