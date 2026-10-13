import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { joinFileStream } from "../lib/join-upload.js";
import { JOIN_CHUNK_BYTES } from "../lib/join-attachment-policy.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileOf = (bytes, extra = {}) => ({
  size: bytes.length,
  meta: JSON.stringify({
    chunks: [
      {
        key: "files/fixture",
        encoding: "raw",
        size: bytes.length,
        sha256: sha(bytes),
        ...extra,
      },
    ],
  }),
});

test("private attachment streaming validates stored size and manifest before object access", () => {
  let reads = 0;
  const env = {
    JOIN_BUCKET: {
      get: () => {
        reads++;
      },
    },
  };
  const bytes = Buffer.from("fixture");
  for (const file of [
    { ...fileOf(bytes), size: -1 },
    fileOf(bytes, { size: JOIN_CHUNK_BYTES + 1 }),
    fileOf(bytes, { key: "../private" }),
    fileOf(bytes, { encoding: "zip" }),
    fileOf(bytes, { sha256: "wrong" }),
    { size: bytes.length, meta: '{"chunks":[]}' },
  ])
    assert.throws(() => joinFileStream(env, file), /Invalid attachment/);
  assert.equal(reads, 0);
});

test("compressed attachment exceeding declared size is canceled without exposing bytes", async () => {
  const declared = Buffer.from("x"),
    larger = gzipSync(Buffer.alloc(1024 * 1024, 120));
  const stream = joinFileStream(
    { JOIN_BUCKET: { get: async () => ({ body: larger }) } },
    fileOf(declared, { encoding: "gzip" }),
  );
  const reader = stream.getReader();
  await assert.rejects(reader.read(), { status: 413 });
});

test("closing a private download cancels an in-progress object stream", async () => {
  let canceled = false,
    reads = 0;
  const source = new ReadableStream({
    cancel() {
      canceled = true;
    },
  });
  const stream = joinFileStream(
    {
      JOIN_BUCKET: {
        get: async () => {
          reads++;
          return { body: source };
        },
      },
    },
    fileOf(Buffer.from("fixture")),
  );
  assert.equal(reads, 0, "no prefetch before consumer demand");
  const reader = stream.getReader(),
    pending = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  await reader.cancel();
  await pending;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(canceled, true);
  assert.equal(reads, 1);
});

test("closing while Storage is opening still cancels its eventual response", async () => {
  let resolveObject,
    canceled = false;
  const opening = new Promise((resolve) => {
    resolveObject = resolve;
  });
  const stream = joinFileStream(
    { JOIN_BUCKET: { get: () => opening } },
    fileOf(Buffer.from("fixture")),
  );
  const reader = stream.getReader(),
    pending = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  await reader.cancel();
  resolveObject({
    body: new ReadableStream({
      cancel() {
        canceled = true;
      },
    }),
  });
  await pending;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(canceled, true);
});
