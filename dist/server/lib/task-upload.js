import { boundedBody } from "./security.js";
import { integrationError } from "./integrations.js";

export const TASK_FILE_MAX_BYTES = 1024 ** 3;
export const TASK_CHUNK_BYTES = 3 * 1024 ** 2;
const LIFETIME = 24 * 60 * 60 * 1000;
const AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);
const fail = (message, status = 400) => {
  throw integrationError(message, status);
};
const bucketOf = (env) => {
  // Supabase uses its dedicated all-format private bucket. The original R2
  // deployment exposes a single private bucket without MIME restrictions.
  const bucket = env.JOIN_BUCKET || env.BUCKET;
  if (!bucket) fail("خدمة مرفقات المهام غير متاحة", 503);
  return bucket;
};
const digest = async (bytes) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const parse = (row) => JSON.parse(row.meta);
const guard = (db) =>
  db
    .prepare("INSERT INTO nl_guards VALUES(?,changes())")
    .bind(crypto.randomUUID());
const partId = (id, part) => `taskpart_${id}_${part}`;
const cutoff = () => new Date(Date.now() - LIFETIME).toISOString();
const resultOf = (row) => ({
  id: row.id,
  name: row.name,
  size: row.size,
  mime: row.mime,
});
const text = (value, max = 200) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    fail("بيانات المرفق غير صالحة");
  return value;
};

export async function beginTaskUpload(env, ownerId, input, authorize) {
  bucketOf(env);
  const name = text(input.name).trim(),
    size = input.size;
  if (
    !name ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > TASK_FILE_MAX_BYTES
  )
    fail("اختر ملفًا بحجم لا يتجاوز 1 غيغابايت", 413);
  const scope = {
    entity_id: text(input.entity_id || ""),
    project_id: text(input.project_id || ""),
    committee_id: text(input.committee_id || ""),
    purpose: text(input.purpose || "reference", 50),
    attach_later: input.attach_later === true,
  };
  await authorize(scope);
  const id = crypto.randomUUID(),
    created = new Date().toISOString();
  const mime = AUDIO_MIMES.has(input.mime)
    ? input.mime
    : "application/octet-stream";
  await env.DB.prepare(
    "INSERT INTO nl_files(id,entity_type,entity_id,meta,name,mime,size,object_key,created_by,created) VALUES(?,'task_upload',?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      ownerId,
      JSON.stringify({ task_upload: scope }),
      name,
      mime,
      size,
      "taskchunks:" + id,
      ownerId,
      created,
    )
    .run();
  return {
    id,
    chunk_bytes: TASK_CHUNK_BYTES,
    parts: Math.ceil(size / TASK_CHUNK_BYTES),
    expires_at: new Date(Date.parse(created) + LIFETIME).toISOString(),
  };
}

async function session(env, ownerId, id, authorize) {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
    fail("جلسة رفع غير صالحة", 404);
  const row = await env.DB.prepare(
    "SELECT * FROM nl_files WHERE id=? AND created_by=?",
  )
    .bind(id, ownerId)
    .first();
  if (
    !row ||
    !["task_upload", "draft", "tasks"].includes(row.entity_type) ||
    row.object_key !== "taskchunks:" + id ||
    !parse(row).task_upload
  )
    fail("جلسة الرفع غير متاحة", 404);
  if (row.entity_type === "task_upload" && row.created <= cutoff())
    fail("انتهت جلسة رفع الملف أعد اختيار المرفق", 410);
  await authorize(parse(row).task_upload);
  return row;
}

async function cleanupUncommitted(env, bucket, id, key) {
  try {
    const saved = await env.DB.prepare(
      "SELECT object_key FROM nl_files WHERE id=?",
    )
      .bind(id)
      .first();
    if (saved?.object_key !== key) await bucket.delete(key);
  } catch {
    console.error("Task attachment cleanup deferred");
  }
}

export async function uploadTaskChunk(req, env, ownerId, id, part, authorize) {
  const row = await session(env, ownerId, id, authorize);
  if (row.entity_type !== "task_upload") fail("اكتمل رفع الملف بالفعل", 409);
  if (
    !Number.isSafeInteger(part) ||
    part < 0 ||
    part >= Math.ceil(row.size / TASK_CHUNK_BYTES)
  )
    fail("جزء الملف غير صالح");
  const size = Math.min(TASK_CHUNK_BYTES, row.size - part * TASK_CHUNK_BYTES);
  const bytes = await boundedBody(req, size);
  if (bytes.length !== size) fail("حجم جزء الملف غير مطابق");
  const sha256 = await digest(bytes),
    pid = partId(id, part);
  const saved = await env.DB.prepare("SELECT meta FROM nl_files WHERE id=?")
    .bind(pid)
    .first();
  if (saved) {
    await session(env, ownerId, id, authorize);
    if (parse(saved).sha256 !== sha256)
      fail("تغير محتوى الملف أعد اختيار المرفق", 409);
    return { ok: true };
  }
  const bucket = bucketOf(env),
    key = "files/" + crypto.randomUUID();
  try {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: "application/octet-stream" },
    });
    await session(env, ownerId, id, authorize);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE nl_files SET entity_id=entity_id WHERE id=? AND created_by=? AND entity_type='task_upload' AND created>?",
      ).bind(id, ownerId, cutoff()),
      guard(env.DB),
      env.DB.prepare(
        "INSERT OR IGNORE INTO nl_files(id,entity_type,entity_id,meta,name,mime,size,object_key,created_by,created) VALUES(?,'task_parts',?,?,?,'application/octet-stream',?,?,?,?)",
      ).bind(
        pid,
        id,
        JSON.stringify({ part, encoding: "raw", sha256 }),
        row.name,
        size,
        key,
        ownerId,
        new Date().toISOString(),
      ),
    ]);
    const persisted = await env.DB.prepare(
      "SELECT meta FROM nl_files WHERE id=?",
    )
      .bind(pid)
      .first();
    if (!persisted || parse(persisted).sha256 !== sha256)
      fail("تغير محتوى الملف أعد اختيار المرفق", 409);
  } finally {
    await cleanupUncommitted(env, bucket, pid, key);
  }
  return { ok: true };
}

export async function completeTaskUpload(env, ownerId, id, authorize) {
  const row = await session(env, ownerId, id, authorize);
  if (row.entity_type !== "task_upload") return resultOf(row);
  const { results } = await env.DB.prepare(
    "SELECT * FROM nl_files WHERE entity_type='task_parts' AND entity_id=? AND created_by=?",
  )
    .bind(id, ownerId)
    .all();
  const parts = new Map(results.map((r) => [parse(r).part, r]));
  const chunks = Array.from(
    { length: Math.ceil(row.size / TASK_CHUNK_BYTES) },
    (_, part) => {
      const saved = parts.get(part),
        size = Math.min(TASK_CHUNK_BYTES, row.size - part * TASK_CHUNK_BYTES);
      if (!saved || saved.id !== partId(id, part) || saved.size !== size)
        fail("لم يكتمل رفع المرفق أعد المحاولة", 409);
      return {
        key: saved.object_key,
        encoding: "raw",
        size,
        sha256: parse(saved).sha256,
      };
    },
  );
  const scope = parse(row).task_upload,
    draft = !scope.entity_id || scope.attach_later;
  const meta = {
    purpose: scope.purpose,
    project_id: scope.project_id,
    committee_id: scope.committee_id,
    task_upload: scope,
    chunks,
    ...(draft ? { pending_resource: "tasks" } : {}),
  };
  await session(env, ownerId, id, authorize);
  try {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE nl_files SET entity_type=?,entity_id=?,meta=? WHERE id=? AND created_by=? AND entity_type='task_upload' AND created>?",
      ).bind(
        draft ? "draft" : "tasks",
        scope.entity_id || ownerId,
        JSON.stringify(meta),
        id,
        ownerId,
        cutoff(),
      ),
      guard(env.DB),
      env.DB.prepare(
        "INSERT INTO nl_audit(id,actor,action,resource,entity_id,project_id,detail,created) VALUES(?,?,?,'tasks',?,?,?,?)",
      ).bind(
        "task-upload-" + id,
        ownerId,
        "إرفاق ملف",
        scope.entity_id || id,
        scope.project_id || null,
        row.name,
        new Date().toISOString(),
      ),
    ]);
  } catch (error) {
    // Retry safely after another completion, or after a lost commit response.
    const current = await session(env, ownerId, id, authorize);
    if (current.entity_type === "task_upload") throw error;
    return resultOf(current);
  }
  return resultOf(row);
}

export function taskFileStream(env, file, authorize = async () => {}) {
  const { chunks } = parse(file);
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > TASK_FILE_MAX_BYTES ||
    !Array.isArray(chunks) ||
    chunks.length !== Math.ceil(file.size / TASK_CHUNK_BYTES) ||
    chunks.some(
      (part, i) =>
        !part ||
        !/^files\/[a-zA-Z0-9-]+$/.test(part.key) ||
        part.encoding !== "raw" ||
        part.size !==
          Math.min(TASK_CHUNK_BYTES, file.size - i * TASK_CHUNK_BYTES) ||
        !/^[a-f0-9]{64}$/.test(part.sha256),
    )
  )
    throw new Error("Invalid task attachment manifest");
  const bucket = bucketOf(env),
    abort = new AbortController();
  let index = 0;
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          if (index === chunks.length) return controller.close();
          await authorize();
          if (abort.signal.aborted) return;
          const part = chunks[index++],
            object = await bucket.get(part.key);
          if (!object) throw new Error("Attachment part unavailable");
          const source = new Response(object.body).body;
          if (abort.signal.aborted) {
            await source.cancel();
            return;
          }
          const bytes = await boundedBody(
            {
              headers: new Headers(),
              body: source.pipeThrough(new TransformStream(), {
                signal: abort.signal,
              }),
            },
            part.size,
          );
          if (
            bytes.length !== part.size ||
            (await digest(bytes)) !== part.sha256
          )
            throw new Error("Attachment integrity mismatch");
          await authorize();
          if (!abort.signal.aborted) controller.enqueue(bytes);
        } catch (error) {
          if (!abort.signal.aborted) controller.error(error);
        }
      },
      cancel() {
        abort.abort();
      },
    },
    { highWaterMark: 0 },
  );
}

export async function cleanupExpiredTaskUploads(env, at = Date.now()) {
  const { results } = await env.DB.prepare(
    "SELECT id FROM nl_files WHERE entity_type='task_upload' AND created<? ORDER BY created LIMIT 50",
  )
    .bind(new Date(at - LIFETIME).toISOString())
    .all();
  if (!results.length) return;
  const bucket = bucketOf(env);
  let remaining = 200;
  for (const row of results) {
    try {
      const { results: parts } = await env.DB.prepare(
        "SELECT id,object_key FROM nl_files WHERE entity_type='task_parts' AND entity_id=? LIMIT ?",
      )
        .bind(row.id, remaining)
        .all();
      for (const part of parts) {
        await bucket.delete(part.object_key);
        await env.DB.prepare(
          "DELETE FROM nl_files WHERE id=? AND entity_type='task_parts'",
        )
          .bind(part.id)
          .run();
        remaining--;
      }
      await env.DB.prepare(
        "DELETE FROM nl_files WHERE id=? AND entity_type='task_upload' AND NOT EXISTS(SELECT 1 FROM nl_files WHERE entity_type='task_parts' AND entity_id=?)",
      )
        .bind(row.id, row.id)
        .run();
    } catch {
      console.error("Expired task upload cleanup deferred");
    }
    if (!remaining) break;
  }
}
