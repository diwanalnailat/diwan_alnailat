import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { app } from "./support.mjs";
import {
  beginTaskUpload,
  uploadTaskChunk,
  completeTaskUpload,
  taskFileStream,
  cleanupExpiredTaskUploads,
  TASK_CHUNK_BYTES,
  TASK_FILE_MAX_BYTES,
} from "../lib/task-upload.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const owner = "task-upload-owner";
const allow = async () => {};
const denied = async () => {
  throw Object.assign(new Error("denied"), { status: 403 });
};
const request = (bytes) =>
  new Request("https://diwan.test/api/task-uploads/chunk", {
    method: "POST",
    body: bytes,
  });
async function fixture() {
  const a = await app();
  a.env.JOIN_BUCKET = a.env.BUCKET;
  return a;
}
const rowOf = (a, id) =>
  a.DB.prepare("SELECT * FROM nl_files WHERE id=?").bind(id).first();
const input = (size, extra = {}) => ({
  name: "fixture.any-format",
  size,
  project_id: "project",
  committee_id: "committee",
  purpose: "completion",
  ...extra,
});

test("task attachment accepts every extension, exact 1GiB limit and normalized server scope", async () => {
  const a = await fixture();
  const session = await beginTaskUpload(
    a.env,
    owner,
    input(TASK_FILE_MAX_BYTES, { name: "fixture.exe" }),
    async (scope) => {
      scope.project_id = "normalized";
    },
  );
  assert.equal(session.parts, 342);
  assert.equal(session.chunk_bytes, 3 * 1024 ** 2);
  const row = await rowOf(a, session.id);
  assert.equal(row.mime, "application/octet-stream");
  assert.equal(JSON.parse(row.meta).task_upload.project_id, "normalized");
  assert.equal(
    a.objects.size,
    0,
    "declaring a large file allocates no file-sized buffer",
  );
  for (const size of [0, -1, 1.5, TASK_FILE_MAX_BYTES + 1])
    await assert.rejects(beginTaskUpload(a.env, owner, input(size), allow), {
      status: 413,
    });
  await assert.rejects(
    beginTaskUpload(a.env, owner, input(1, { name: "bad\r\nname" }), allow),
    { status: 400 },
  );
  await assert.rejects(
    beginTaskUpload(
      { ...a.env, JOIN_BUCKET: undefined, BUCKET: undefined },
      owner,
      input(1),
      allow,
    ),
    { status: 503 },
  );
  await assert.rejects(beginTaskUpload(a.env, owner, input(1), denied), {
    status: 403,
  });
  const voice = await beginTaskUpload(
    a.env,
    owner,
    input(1, { name: "voice.webm", mime: "audio/webm" }),
    allow,
  );
  assert.equal((await rowOf(a, voice.id)).mime, "audio/webm");
  const html = await beginTaskUpload(
    a.env,
    owner,
    input(1, { name: "page.html", mime: "text/html" }),
    allow,
  );
  assert.equal((await rowOf(a, html.id)).mime, "application/octet-stream");
});

test("task chunks resume without replacement, finalize once and stream byte-identically", async () => {
  const a = await fixture(),
    bytes = Buffer.alloc(TASK_CHUNK_BYTES + 19, 37);
  const upload = await beginTaskUpload(
    a.env,
    owner,
    input(bytes.length),
    allow,
  );
  await assert.rejects(completeTaskUpload(a.env, owner, upload.id, allow), {
    status: 409,
  });
  await assert.rejects(
    uploadTaskChunk(
      request(bytes.subarray(TASK_CHUNK_BYTES)),
      a.env,
      "another-owner",
      upload.id,
      1,
      allow,
    ),
    { status: 404 },
  );
  const last = bytes.subarray(TASK_CHUNK_BYTES);
  await uploadTaskChunk(request(last), a.env, owner, upload.id, 1, allow);
  await uploadTaskChunk(request(last), a.env, owner, upload.id, 1, allow);
  assert.equal(a.objects.size, 1);
  await assert.rejects(
    uploadTaskChunk(
      request(Buffer.alloc(last.length, 40)),
      a.env,
      owner,
      upload.id,
      1,
      allow,
    ),
    { status: 409 },
  );
  await assert.rejects(
    uploadTaskChunk(
      request(Buffer.alloc(last.length + 1)),
      a.env,
      owner,
      upload.id,
      1,
      allow,
    ),
    { status: 413 },
  );
  await assert.rejects(
    uploadTaskChunk(
      request(Buffer.alloc(last.length - 1)),
      a.env,
      owner,
      upload.id,
      1,
      allow,
    ),
    { status: 400 },
  );
  await assert.rejects(
    uploadTaskChunk(request(last), a.env, owner, upload.id, -1, allow),
    { status: 400 },
  );
  await uploadTaskChunk(
    request(bytes.subarray(0, TASK_CHUNK_BYTES)),
    a.env,
    owner,
    upload.id,
    0,
    allow,
  );
  const first = await completeTaskUpload(a.env, owner, upload.id, allow);
  assert.deepEqual(
    await completeTaskUpload(a.env, owner, upload.id, allow),
    first,
  );
  assert.equal(
    (
      await a.DB.prepare("SELECT id FROM nl_audit WHERE id=?")
        .bind("task-upload-" + upload.id)
        .all()
    ).results.length,
    1,
  );
  const row = await rowOf(a, upload.id);
  assert.equal(row.entity_type, "draft");
  const meta = JSON.parse(row.meta);
  assert.equal(meta.pending_resource, "tasks");
  assert.equal(meta.purpose, "completion");
  assert.equal(meta.chunks.length, 2);
  assert.deepEqual(
    Buffer.from(await new Response(taskFileStream(a.env, row)).arrayBuffer()),
    bytes,
  );
  await assert.rejects(completeTaskUpload(a.env, owner, upload.id, denied), {
    status: 403,
  });
  await assert.rejects(
    uploadTaskChunk(request(last), a.env, owner, upload.id, 1, allow),
    { status: 409 },
  );
  await a.DB.prepare("UPDATE nl_files SET created=? WHERE id=?")
    .bind("2020-01-01T00:00:00.000Z", upload.id)
    .run();
  await cleanupExpiredTaskUploads(a.env);
  assert.equal(a.objects.size, 2, "maintenance preserves attached originals");
});

test("exact 1GiB task file streams completely with only one bounded part requested at a time", async () => {
  const bytes = Buffer.alloc(TASK_CHUNK_BYTES, 83);
  const tail = bytes.subarray(0, TASK_FILE_MAX_BYTES % TASK_CHUNK_BYTES);
  const fullHash = sha(bytes),
    tailHash = sha(tail);
  const chunks = Array.from(
    { length: Math.ceil(TASK_FILE_MAX_BYTES / TASK_CHUNK_BYTES) },
    (_, part) => ({
      key: "files/part-" + part,
      encoding: "raw",
      size: part === 341 ? tail.length : bytes.length,
      sha256: part === 341 ? tailHash : fullHash,
    }),
  );
  let reads = 0,
    total = 0;
  const stream = taskFileStream(
    {
      JOIN_BUCKET: {
        get: async () => ({ body: ++reads === chunks.length ? tail : bytes }),
      },
    },
    { size: TASK_FILE_MAX_BYTES, meta: JSON.stringify({ chunks }) },
  );
  assert.equal(reads, 0);
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.length;
    assert.ok(next.value.length <= TASK_CHUNK_BYTES);
    assert.equal(next.value[0], 83);
    assert.equal(next.value.at(-1), 83);
  }
  assert.equal(total, TASK_FILE_MAX_BYTES);
  assert.equal(reads, 342);
});

test("scope is revalidated after storage and expired abandoned sessions are cleaned", async () => {
  const a = await fixture(),
    bytes = Buffer.from("fixture");
  const upload = await beginTaskUpload(
    a.env,
    owner,
    input(bytes.length, { entity_id: "task" }),
    allow,
  );
  let revoked = false;
  const originalPut = a.env.JOIN_BUCKET.put;
  a.env.JOIN_BUCKET.put = async (...args) => {
    await originalPut(...args);
    revoked = true;
  };
  await assert.rejects(
    uploadTaskChunk(request(bytes), a.env, owner, upload.id, 0, async () => {
      if (revoked) await denied();
    }),
    { status: 403 },
  );
  assert.equal(
    a.objects.size,
    0,
    "uncommitted object removed after revocation",
  );
  a.env.JOIN_BUCKET.put = originalPut;
  await uploadTaskChunk(request(bytes), a.env, owner, upload.id, 0, allow);
  await a.DB.prepare("UPDATE nl_files SET created=? WHERE id=?")
    .bind("2020-01-01T00:00:00.000Z", upload.id)
    .run();
  await assert.rejects(completeTaskUpload(a.env, owner, upload.id, allow), {
    status: 410,
  });
  await assert.rejects(
    uploadTaskChunk(request(bytes), a.env, owner, upload.id, 0, allow),
    { status: 410 },
  );
  await cleanupExpiredTaskUploads(a.env);
  assert.equal(a.objects.size, 0);
  assert.ok(!(await rowOf(a, upload.id)));
  const { results } = await a.DB.prepare(
    "SELECT id FROM nl_files WHERE entity_type='task_parts'",
  ).all();
  assert.equal(results.length, 0);
});

test("completed existing task attachment keeps purpose and scope", async () => {
  const a = await fixture(),
    bytes = Buffer.from("fixture");
  const upload = await beginTaskUpload(
    a.env,
    owner,
    input(bytes.length, { entity_id: "task" }),
    allow,
  );
  await uploadTaskChunk(request(bytes), a.env, owner, upload.id, 0, allow);
  await completeTaskUpload(a.env, owner, upload.id, allow);
  const row = await rowOf(a, upload.id);
  assert.equal(row.entity_type, "tasks");
  assert.equal(row.entity_id, "task");
  assert.equal(JSON.parse(row.meta).task_upload.entity_id, "task");
});

test("lost successful storage and commit responses retain saved bytes and resume without duplicate audit", async () => {
  const a = await fixture(),
    bytes = Buffer.from("fixture");
  const upload = await beginTaskUpload(
    a.env,
    owner,
    input(bytes.length),
    allow,
  );
  const originalBatch = a.DB.batch.bind(a.DB);
  a.DB.batch = async (statements) => {
    await originalBatch(statements);
    throw new Error("lost commit response");
  };
  await assert.rejects(
    uploadTaskChunk(request(bytes), a.env, owner, upload.id, 0, allow),
    /lost commit/,
  );
  assert.equal(a.objects.size, 1, "object survives its committed row");
  a.DB.batch = originalBatch;
  await uploadTaskChunk(request(bytes), a.env, owner, upload.id, 0, allow);
  a.DB.batch = async (statements) => {
    await originalBatch(statements);
    throw new Error("lost commit response");
  };
  assert.equal(
    (await completeTaskUpload(a.env, owner, upload.id, allow)).id,
    upload.id,
  );
  a.DB.batch = originalBatch;
  assert.equal(
    (
      await a.DB.prepare("SELECT id FROM nl_audit WHERE id=?")
        .bind("task-upload-" + upload.id)
        .all()
    ).results.length,
    1,
  );
  assert.deepEqual(
    Buffer.from(
      await new Response(
        taskFileStream(a.env, await rowOf(a, upload.id)),
      ).arrayBuffer(),
    ),
    bytes,
  );
});

test("concurrent conflicting chunks cannot replace committed data or leak the losing object", async () => {
  const a = await fixture(),
    bytes = Buffer.from("fixture"),
    altered = Buffer.from("changed");
  // The in-process SQLite test adapter shares one connection; model D1's
  // serialized atomic batches while keeping object writes concurrent.
  const batch = a.DB.batch.bind(a.DB);
  let queue = Promise.resolve();
  a.DB.batch = (statements) => {
    const result = queue.then(() => batch(statements));
    queue = result.catch(() => {});
    return result;
  };
  const upload = await beginTaskUpload(
    a.env,
    owner,
    input(bytes.length),
    allow,
  );
  let arrival = 0,
    release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  const put = a.env.JOIN_BUCKET.put;
  a.env.JOIN_BUCKET.put = async (...args) => {
    await put(...args);
    if (++arrival === 2) release();
    await ready;
  };
  const outcomes = await Promise.allSettled([
    uploadTaskChunk(request(bytes), a.env, owner, upload.id, 0, allow),
    uploadTaskChunk(request(altered), a.env, owner, upload.id, 0, allow),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    outcomes.filter((r) => r.status === "rejected")[0].reason.status,
    409,
  );
  assert.equal(a.objects.size, 1);
  await completeTaskUpload(a.env, owner, upload.id, allow);
  const stored = Buffer.from(
    await new Response(
      taskFileStream(a.env, await rowOf(a, upload.id)),
    ).arrayBuffer(),
  );
  assert.ok(stored.equals(bytes) || stored.equals(altered));
});

const streamFile = (bytes, overrides = {}) => ({
  size: bytes.length,
  meta: JSON.stringify({
    chunks: [
      {
        key: "files/fixture",
        encoding: "raw",
        size: bytes.length,
        sha256: sha(bytes),
        ...overrides,
      },
    ],
  }),
});
test("task downloads reject malformed and corrupted chunks, recheck permission and stop on cancellation", async () => {
  const bytes = Buffer.from("fixture");
  let reads = 0;
  const env = {
    JOIN_BUCKET: {
      get: async () => {
        reads++;
        return { body: bytes };
      },
    },
  };
  for (const file of [
    streamFile(bytes, { key: "../secret" }),
    streamFile(bytes, { size: 99 }),
    streamFile(bytes, { encoding: "gzip" }),
    { ...streamFile(bytes), size: TASK_FILE_MAX_BYTES + 1 },
  ])
    assert.throws(() => taskFileStream(env, file), /Invalid task/);
  assert.equal(reads, 0);
  await assert.rejects(
    new Response(taskFileStream(env, streamFile(bytes), denied)).arrayBuffer(),
    { status: 403 },
  );
  assert.equal(reads, 0);
  let checks = 0;
  await assert.rejects(
    new Response(
      taskFileStream(env, streamFile(bytes), async () => {
        if (++checks === 2) await denied();
      }),
    ).arrayBuffer(),
    { status: 403 },
  );
  await assert.rejects(
    new Response(
      taskFileStream(env, streamFile(bytes, { sha256: "0".repeat(64) })),
    ).arrayBuffer(),
    /integrity/,
  );
  let canceled = false;
  const stream = taskFileStream(
    {
      JOIN_BUCKET: {
        get: async () => ({
          body: new ReadableStream({
            cancel() {
              canceled = true;
            },
          }),
        }),
      },
    },
    streamFile(bytes),
  );
  const reader = stream.getReader(),
    pending = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  await reader.cancel();
  await pending;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(canceled, true);
});
