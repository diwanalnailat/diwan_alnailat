import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import worker from "../worker.js";
import { fixture, owner, saveTask } from "./support.mjs";
import {
  encodeStoredFile,
  storedFileBytes,
  storedFileStream,
} from "../lib/stored-files.js";

const original = Buffer.from(
  "%PDF-1.7\n" + "signed original fixture\n".repeat(6000),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const auth = (as = owner) => ({
  origin: "https://diwan.test",
  "oai-authenticated-user-id": as.id,
  "oai-authenticated-user-email": as.email,
});
async function uploadFile(
  a,
  resource,
  bytes = original,
  extra = {},
  expectedStatus = 200,
) {
  const form = new FormData();
  form.set(
    "file",
    new File([bytes], "original.pdf", { type: "application/pdf" }),
  );
  form.set("resource", resource);
  form.set("project", a.pid);
  form.set("committee", a.cid);
  // These forged fields must never control server-generated storage metadata.
  form.set("storage", JSON.stringify({ encoding: "raw", sha256: "bad" }));
  form.set("meta", JSON.stringify({ storage: { encoding: "raw" } }));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const response = await worker.fetch(
    new Request("https://diwan.test/api/upload", {
      method: "POST",
      headers: auth(),
      body: form,
    }),
    a.env,
  );
  const result = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(result));
  if (expectedStatus !== 200) return result;
  return a.DB.prepare("SELECT * FROM nl_files WHERE id=?")
    .bind(result.id)
    .first();
}
const download = (a, id, as = owner) =>
  worker.fetch(
    new Request("https://diwan.test/api/files/" + id, { headers: auth(as) }),
    a.env,
  );

test("all workspace resources store smaller lossless bytes and restore authorized originals", async () => {
  const a = await fixture();
  for (const resource of [
    "tasks",
    "expenses",
    "assets",
    "documents",
    "suppliers",
    "advances",
  ]) {
    const file = await uploadFile(a, resource),
      storage = JSON.parse(file.meta).storage;
    assert.equal(storage.encoding, "gzip");
    assert.equal(storage.sha256, sha(original));
    assert.equal(file.size, original.length);
    assert.equal(
      storage.stored_size,
      a.objects.get(file.object_key).byteLength,
    );
    assert.ok(storage.stored_size < original.length);
    const denied = await download(a, file.id, a.outsider);
    assert.equal(denied.status, 403);
    const response = await download(a, file.id);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-encoding"), null);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
  }
});

test("uncompressible and old files retain original bytes; storage corruption never silently passes", async () => {
  const a = await fixture(),
    random = Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(1024)]);
  const raw = await uploadFile(a, "tasks", random);
  assert.equal(JSON.parse(raw.meta).storage.encoding, "raw");
  assert.deepEqual(
    Buffer.from(await (await download(a, raw.id)).arrayBuffer()),
    random,
  );
  // Existing uncompressed objects with no compression metadata remain readable.
  await a.DB.prepare("UPDATE nl_files SET meta='{}' WHERE id=?")
    .bind(raw.id)
    .run();
  assert.deepEqual(
    Buffer.from(await (await download(a, raw.id)).arrayBuffer()),
    random,
  );
  const compressed = await uploadFile(a, "tasks");
  const changed = Buffer.from(original);
  changed[changed.length - 1] ^= 1;
  const damaged = await encodeStoredFile(changed);
  a.objects.set(compressed.object_key, damaged.bytes);
  await assert.rejects(async () =>
    (await download(a, compressed.id)).arrayBuffer(),
  );
});

test("task comments retain encoding metadata and invoice extraction receives decoded originals", async () => {
  const a = await fixture(),
    task = await saveTask(a);
  const comment = await uploadFile(a, "tasks", original, {
    purpose: "comment",
    entity: task,
    attach_later: "true",
  });
  const posted = await a.req("tasks/comment", {
    id: task,
    body: "Fixture",
    files: [comment.id],
  });
  assert.equal(posted.status, 200, JSON.stringify(posted.data));
  const linked = await a.DB.prepare("SELECT meta FROM nl_files WHERE id=?")
    .bind(comment.id)
    .first();
  assert.deepEqual(
    JSON.parse(linked.meta).storage,
    JSON.parse(comment.meta).storage,
  );
  assert.deepEqual(
    Buffer.from(await (await download(a, comment.id)).arrayBuffer()),
    original,
  );
  const invoice = await uploadFile(a, "expenses", original, {
    purpose: "invoice",
  });
  Object.assign(a.env, {
    AI_ENABLED: "true",
    OPENAI_API_KEY: "test-secret",
    OPENAI_MODEL: "configured-model",
  });
  let calls = 0;
  a.env.PROVIDER_FETCH = async (_, options) => {
    calls++;
    const content = JSON.parse(options.body).input[0].content[1];
    assert.deepEqual(
      Buffer.from(content.file_data.split(",")[1], "base64"),
      original,
    );
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(
                Object.fromEntries(
                  [
                    "supplier_name",
                    "number",
                    "date",
                    "amount",
                    "tax",
                    "description",
                  ].map((key) => [key, { value: null, confidence: "missing" }]),
                ),
              ),
            },
          ],
        },
      ],
    });
  };
  assert.equal(
    (await a.req("extract", { file_id: invoice.id }, a.outsider)).status,
    403,
  );
  assert.equal(calls, 0);
  const extracted = await a.req("extract", { file_id: invoice.id });
  assert.equal(extracted.status, 200, JSON.stringify(extracted.data));
  assert.equal(calls, 1);
});

test("decoding bounds expansion, checks digests and cancels stopped downloads", async () => {
  const encoded = await encodeStoredFile(original);
  const file = {
    size: original.length,
    meta: JSON.stringify({ storage: encoded.storage }),
  };
  await assert.rejects(
    storedFileBytes({ ...file, size: 10 }, { body: encoded.bytes }),
  );
  await assert.rejects(
    storedFileBytes(
      {
        ...file,
        meta: JSON.stringify({
          storage: { ...encoded.storage, sha256: "0".repeat(64) },
        }),
      },
      { body: encoded.bytes },
    ),
    /integrity/,
  );
  for (const readFirst of [true, false]) {
    let canceled = false;
    const source = new ReadableStream({
      cancel() {
        canceled = true;
      },
    });
    const reader = storedFileStream(file, { body: source }).getReader();
    const pending = readFirst ? reader.read() : undefined;
    if (readFirst) await new Promise((resolve) => setImmediate(resolve));
    await reader.cancel();
    await pending;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(canceled, true);
  }
});

test("failed object writes are cleaned and lost commit replies never delete stored originals", async () => {
  const a = await fixture(),
    put = a.env.BUCKET.put;
  a.env.BUCKET.put = async (key, bytes) => {
    await put(key, bytes);
    throw new Error("fixture interrupted write");
  };
  await uploadFile(a, "tasks", original, {}, 500);
  assert.equal(a.objects.size, 0);
  a.env.BUCKET.put = put;
  const batch = a.DB.batch;
  a.DB.batch = async (statements) => {
    await batch(statements);
    throw new Error("fixture lost commit reply");
  };
  await uploadFile(a, "tasks", original, {}, 500);
  a.DB.batch = batch;
  const saved = await a.DB.prepare("SELECT * FROM nl_files").first();
  assert.ok(saved);
  assert.equal(a.objects.size, 1);
  assert.deepEqual(
    Buffer.from(await (await download(a, saved.id)).arrayBuffer()),
    original,
  );
});
