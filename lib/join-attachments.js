import { boundedBody, jsonBody } from "./security.js";
import {
  JOIN_MAX_BYTES,
  JOIN_MAX_FILES,
  JOIN_FILE_MAX_BYTES,
  JOIN_CHUNK_BYTES,
  JOIN_STORAGE_MAX_BYTES,
} from "./join-attachment-policy.js";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export function attachmentManifest(value = []) {
  if (!Array.isArray(value) || value.length > JOIN_MAX_FILES)
    fail("يمكن إرفاق 6 ملفات كحد أقصى.");
  let total = 0,
    identities = 0;
  const result = value.map((f) => {
    if (
      !f ||
      !["identity", "experience"].includes(f.kind) ||
      typeof f.name !== "string" ||
      !f.name.trim() ||
      f.name.length > 180 ||
      /[\x00-\x1f\x7f/\\]/.test(f.name) ||
      !Number.isSafeInteger(f.size) ||
      f.size <= 0 ||
      (!Array.isArray(f.parts) && !/^[a-f0-9]{64}$/.test(f.sha256 || ""))
    )
      fail("بيانات المرفق غير صالحة. أعد اختيار الملف.");
    total += f.size;
    if (f.size > JOIN_FILE_MAX_BYTES)
      fail("الحد الأقصى للملف الواحد 100 ميغابايت.", 413);
    if (
      f.parts !== undefined &&
      (!Array.isArray(f.parts) ||
        f.parts.length !== Math.ceil(f.size / JOIN_CHUNK_BYTES) ||
        f.parts.some(
          (part) => typeof part !== "string" || !/^[a-f0-9]{64}$/.test(part),
        ))
    )
      fail("بيانات أجزاء الملف غير صالحة. أعد اختيار الملف.");
    if (f.kind === "identity") identities++;
    return {
      kind: f.kind,
      name: f.name,
      size: f.size,
      ...(f.parts ? { parts: f.parts } : { sha256: f.sha256 }),
    };
  });
  if (identities > 1) fail("اختر ملفًا واحدًا للهوية.");
  if (total > JOIN_MAX_BYTES)
    fail("إجمالي المرفقات يجب ألا يتجاوز 300 ميغابايت.", 413);
  return result;
}

export async function joinVerificationBody(req) {
  if (
    !(req.headers.get("content-type") || "").startsWith("multipart/form-data")
  )
    return { body: await jsonBody(req, 2048), files: [] };
  const bytes = await boundedBody(req, JOIN_STORAGE_MAX_BYTES + 65536);
  let form;
  try {
    form = await new Response(bytes, {
      headers: {
        "Content-Type": req.headers.get("content-type"),
      },
    }).formData();
  } catch {
    fail("تعذر قراءة المرفقات. أعد المحاولة.");
  }
  const files = [];
  for (const [kind, value] of form.entries()) {
    if (["challenge_id", "code"].includes(kind) && typeof value === "string")
      continue;
    if (!["identity", "experience"].includes(kind) || typeof value === "string")
      fail("حقل مرفق غير صالح.");
    files.push({ kind, file: value });
  }
  if (files.length > JOIN_MAX_FILES) fail("يمكن إرفاق 6 ملفات كحد أقصى.");
  return {
    body: { challenge_id: form.get("challenge_id"), code: form.get("code") },
    files,
  };
}

export async function storeJoinAttachments(env, request, manifest, files) {
  if (manifest.length !== files.length)
    fail("أرفق الملفات التي اخترتها قبل إرسال رمز التحقق.");
  const prepared = [];
  // Validate every file before any Storage writes. Files remain opaque bytes:
  // no preview, execution, extraction or trust in client MIME types.
  for (let i = 0; i < manifest.length; i++) {
    const expected = manifest[i],
      { kind, file } = files[i];
    if (
      kind !== expected.kind ||
      file.name !== expected.name ||
      file.size !== expected.size
    )
      fail("تغيرت المرفقات. أعد تقديم الطلب بالملفات الصحيحة.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    if (digest !== expected.sha256)
      fail("المرفق لا يطابق الملف الذي أقررت بصحته.");
    const id = crypto.randomUUID();
    prepared.push({ ...expected, id, key: "files/" + id, bytes });
  }
  const bucket = env.JOIN_BUCKET || env.BUCKET;
  if (prepared.length && !bucket) fail("خدمة المرفقات غير متاحة مؤقتًا.", 503);
  const uploaded = [];
  const cleanup = async (checkCommitted = false) => {
    for (const f of uploaded) {
      try {
        // A lost commit response must not cause deletion of a committed file.
        if (
          checkCommitted &&
          (await env.DB.prepare("SELECT id FROM nl_files WHERE id=?")
            .bind(f.id)
            .first())
        )
          continue;
        await bucket.delete(f.key);
      } catch {
        console.error("Join attachment cleanup deferred");
      }
    }
  };
  try {
    for (const f of prepared) {
      uploaded.push(f);
      await bucket.put(f.key, f.bytes, {
        httpMetadata: { contentType: "application/octet-stream" },
      });
    }
  } catch (e) {
    await cleanup();
    throw e;
  }
  return {
    cleanup,
    statements: prepared.map((f) =>
      env.DB.prepare(
        "INSERT INTO nl_files(id,entity_type,entity_id,meta,name,mime,size,object_key,created_by,created) VALUES(?,'join_requests',?,?,?,'application/octet-stream',?,?,?,?)",
      ).bind(
        f.id,
        request.id,
        JSON.stringify({ kind: f.kind, sha256: f.sha256 }),
        f.name,
        f.size,
        f.key,
        "applicant:" + request.id,
        new Date().toISOString(),
      ),
    ),
  };
}
