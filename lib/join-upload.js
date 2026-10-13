import { hmac, equal, integrationError } from "./integrations.js";
import { boundedBody } from "./security.js";
import { attachmentManifest } from "./join-attachments.js";
import {
  JOIN_CHUNK_BYTES,
  JOIN_FILE_MAX_BYTES,
} from "./join-attachment-policy.js";
import { assertNewApplicant, newApplicantGuard } from "./join-eligibility.js";

const fail = (text, status = 400) => {
  throw integrationError(text, status);
};
const guard = (db) =>
  db
    .prepare("INSERT INTO nl_guards VALUES(?,changes())")
    .bind(crypto.randomUUID());
const digest = async (bytes) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const token = (env, challenge, binding) =>
  hmac(env.OTP_SECRET, `join-upload|${challenge}|${binding}`);
const bucketOf = (env) => {
  const bucket = env.JOIN_BUCKET || env.BUCKET;
  if (!bucket) fail("خدمة المرفقات غير متاحة مؤقتًا.", 503);
  return bucket;
};
export async function beginJoinUpload(env, row, otp, binding) {
  const manifest = attachmentManifest(
    JSON.parse(row.policy_snapshot).attachments,
  );
  if (!manifest.length || manifest.some((f) => !f.parts))
    fail("أعد اختيار المرفقات وإرسال الطلب.");
  if (!otp.used) {
    const at = new Date().toISOString();
    await env.DB.batch([
      newApplicantGuard(env.DB, row.phone),
      env.DB.prepare(
        "UPDATE nl_otp SET used=1,expires=? WHERE id=? AND used=0 AND expires>? AND attempts<=5",
      ).bind(Date.now() + 3600000, otp.id, Date.now()),
      guard(env.DB),
      env.DB.prepare(
        "UPDATE nl_join_requests SET verified_at=?,updated=?,version=version+1 WHERE id=? AND status='verifying' AND verified_at IS NULL",
      ).bind(at, at, row.id),
      guard(env.DB),
    ]);
  }
  return {
    upload_token: await token(env, otp.id, binding),
    challenge_id: otp.id,
    expires_in: Math.max(
      0,
      Math.floor(
        ((otp.used ? otp.expires : Date.now() + 3600000) - Date.now()) / 1000,
      ),
    ),
  };
}
export async function joinUploadSession(req, env, binding) {
  const challenge = req.headers.get("x-join-challenge") || "";
  const supplied = req.headers.get("x-join-upload") || "";
  if (
    !/^[a-f0-9-]{36}$/.test(challenge) ||
    !/^[a-f0-9]{64}$/.test(binding) ||
    !/^[a-f0-9]{64}$/.test(supplied) ||
    !equal(supplied, await token(env, challenge, binding))
  )
    fail("جلسة رفع الملفات غير صالحة. أعد التحقق من جوالك.", 403);
  const otp = await env.DB.prepare(
    "SELECT site_id FROM nl_otp WHERE id=? AND used=1 AND status='sent' AND expires>? AND site_id LIKE 'join:%'",
  )
    .bind(challenge, Date.now())
    .first();
  const row =
    otp &&
    (await env.DB.prepare(
      "SELECT * FROM nl_join_requests WHERE id=? AND verified_at IS NOT NULL",
    )
      .bind(otp.site_id.slice(5))
      .first());
  if (!row) fail("انتهت جلسة الرفع. أعد تقديم الطلب والتحقق من جوالك.", 410);
  if (row.status === "verifying") await assertNewApplicant(env.DB, row.phone);
  return {
    row,
    manifest: attachmentManifest(JSON.parse(row.policy_snapshot).attachments),
    challenge,
  };
}
const partId = (request, file, part) => `joinpart_${request}_${file}_${part}`;
export async function uploadJoinChunk(req, env, session) {
  const { row, manifest, challenge } = session;
  if (row.status !== "verifying") fail("أُرسل الطلب بالفعل.", 409);
  const url = new URL(req.url),
    file = Number(url.searchParams.get("file")),
    part = Number(url.searchParams.get("part"));
  if (
    !url.searchParams.has("file") ||
    !url.searchParams.has("part") ||
    !Number.isSafeInteger(file) ||
    !Number.isSafeInteger(part) ||
    file < 0 ||
    part < 0 ||
    !manifest[file]?.parts?.[part]
  )
    fail("جزء الملف غير صالح.");
  const expected = manifest[file],
    size = Math.min(JOIN_CHUNK_BYTES, expected.size - part * JOIN_CHUNK_BYTES);
  const bytes = await boundedBody(req, size);
  if (bytes.length !== size || (await digest(bytes)) !== expected.parts[part])
    fail("تغير محتوى الملف. أعد اختيار المرفقات.");
  const id = partId(row.id, file, part);
  if (
    await env.DB.prepare("SELECT id FROM nl_files WHERE id=?").bind(id).first()
  )
    return { ok: true };
  // Only compress our bounded, verified bytes; never decode an applicant's archive.
  const compressed = new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  const encoding = compressed.length < bytes.length ? "gzip" : "raw";
  const stored = encoding === "gzip" ? compressed : bytes;
  const key = "files/" + crypto.randomUUID(),
    bucket = bucketOf(env);
  try {
    await bucket.put(key, stored, {
      httpMetadata: { contentType: "application/octet-stream" },
    });
    await env.DB.batch([
      newApplicantGuard(env.DB, row.phone),
      env.DB.prepare(
        "UPDATE nl_join_requests SET version=version+1 WHERE id=? AND status='verifying' AND verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM nl_otp WHERE id=? AND used=1 AND expires>?)",
      ).bind(row.id, challenge, Date.now()),
      guard(env.DB),
      env.DB.prepare(
        "INSERT OR IGNORE INTO nl_files(id,entity_type,entity_id,meta,name,mime,size,object_key,created_by,created) VALUES(?,'join_upload',?,?,?,'application/octet-stream',?,?,?,?)",
      ).bind(
        id,
        row.id,
        JSON.stringify({
          file,
          part,
          encoding,
          sha256: expected.parts[part],
          stored_size: stored.length,
        }),
        expected.name,
        size,
        key,
        "applicant:" + row.id,
        new Date().toISOString(),
      ),
    ]);
  } catch (error) {
    // Keep an object when its commit succeeded but its response was lost.
    await cleanupUncommittedPart(env, bucket, id, key);
    throw error;
  }
  await cleanupUncommittedPart(env, bucket, id, key);
  return { ok: true };
}
async function cleanupUncommittedPart(env, bucket, id, key) {
  try {
    const saved = await env.DB.prepare(
      "SELECT object_key FROM nl_files WHERE id=?",
    )
      .bind(id)
      .first();
    if (saved?.object_key !== key) await bucket.delete(key);
  } catch {
    console.error("Join upload cleanup deferred");
  }
}
export async function joinUploadStatus(env, session) {
  const { results } = await env.DB.prepare(
    "SELECT meta FROM nl_files WHERE entity_type='join_upload' AND entity_id=?",
  )
    .bind(session.row.id)
    .all();
  return {
    complete: session.row.status !== "verifying",
    uploaded: results.map((f) => {
      const m = JSON.parse(f.meta);
      return [m.file, m.part];
    }),
  };
}
export async function completedJoinFiles(env, session) {
  const { row, manifest } = session;
  const { results } = await env.DB.prepare(
    "SELECT * FROM nl_files WHERE entity_type='join_upload' AND entity_id=?",
  )
    .bind(row.id)
    .all();
  const parts = new Map(results.map((f) => [f.id, f]));
  const statements = manifest.map((file, index) => {
    const chunks = file.parts.map((sha256, part) => {
      const saved = parts.get(partId(row.id, index, part));
      if (
        !saved ||
        JSON.parse(saved.meta).sha256 !== sha256 ||
        saved.size !==
          Math.min(JOIN_CHUNK_BYTES, file.size - part * JOIN_CHUNK_BYTES)
      )
        fail(
          "لم يكتمل رفع المرفقات. أعد المحاولة لاستكمال الأجزاء الناقصة.",
          409,
        );
      const meta = JSON.parse(saved.meta);
      return {
        key: saved.object_key,
        encoding: meta.encoding,
        size: saved.size,
        sha256,
      };
    });
    const id = crypto.randomUUID();
    return env.DB.prepare(
      "INSERT INTO nl_files(id,entity_type,entity_id,meta,name,mime,size,object_key,created_by,created) VALUES(?,'join_requests',?,?,?,'application/octet-stream',?,?,?,?)",
    ).bind(
      id,
      row.id,
      JSON.stringify({ kind: file.kind, chunks }),
      file.name,
      file.size,
      "chunks:" + id,
      "applicant:" + row.id,
      new Date().toISOString(),
    );
  });
  statements.push(
    env.DB.prepare(
      "UPDATE nl_files SET entity_type='join_parts' WHERE entity_type='join_upload' AND entity_id=?",
    ).bind(row.id),
  );
  return statements;
}
export function joinFileStream(env, file) {
  const { chunks } = JSON.parse(file.meta);
  if (
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > JOIN_FILE_MAX_BYTES ||
    !Array.isArray(chunks) ||
    chunks.length !== Math.ceil(file.size / JOIN_CHUNK_BYTES) ||
    chunks.some(
      (part, i) =>
        !part ||
        !/^files\/[a-zA-Z0-9-]+$/.test(part.key) ||
        !["raw", "gzip"].includes(part.encoding) ||
        part.size !==
          Math.min(JOIN_CHUNK_BYTES, file.size - i * JOIN_CHUNK_BYTES) ||
        !/^[a-f0-9]{64}$/.test(part.sha256),
    )
  )
    throw new Error("Invalid attachment manifest");
  let index = 0;
  const bucket = bucketOf(env);
  const abort = new AbortController();
  // Pull one part at a time, checking byte identity before releasing it.
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          if (index === chunks.length) return controller.close();
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
              body: source.pipeThrough(
                part.encoding === "gzip"
                  ? new DecompressionStream("gzip")
                  : new TransformStream(),
                { signal: abort.signal },
              ),
            },
            part.size,
          );
          if (
            bytes.length !== part.size ||
            (await digest(bytes)) !== part.sha256
          )
            throw new Error("Attachment integrity mismatch");
          if (!abort.signal.aborted) controller.enqueue(bytes);
        } catch (error) {
          if (!abort.signal.aborted) controller.error(error);
        }
      },
      cancel() {
        // Stop the active object/decompression stream when a download closes.
        abort.abort();
      },
    },
    { highWaterMark: 0 },
  );
}
export async function cleanupExpiredJoinUploads(env, at = Date.now()) {
  const { results } = await env.DB.prepare(
    "SELECT id,object_key FROM nl_files WHERE entity_type='join_upload' AND created<? ORDER BY created LIMIT 200",
  )
    .bind(new Date(at - 86400000).toISOString())
    .all();
  if (!results.length) return;
  const bucket = bucketOf(env);
  for (const f of results) {
    try {
      await bucket.delete(f.object_key);
      await env.DB.prepare(
        "DELETE FROM nl_files WHERE id=? AND entity_type='join_upload'",
      )
        .bind(f.id)
        .run();
    } catch {
      console.error("Expired join upload cleanup deferred");
    }
  }
}
