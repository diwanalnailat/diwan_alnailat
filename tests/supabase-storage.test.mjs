import test from "node:test";
import assert from "node:assert/strict";
import { supabaseStorage } from "../lib/supabase-storage.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_fixture",
};
test("private Storage validates bucket privacy and object paths before making requests", async () => {
  const calls = [];
  const storage = supabaseStorage(env, async (url, options) => {
    calls.push({ url, options });
    return Response.json({ id: "diwan-files", public: true });
  });
  await assert.rejects(storage.inspect(), /private Storage/);
  const previous = calls.length;
  await assert.rejects(
    storage.put("../other/private", new Uint8Array()),
    /Invalid object/,
  );
  await assert.rejects(storage.delete("files/../../other"), /Invalid object/);
  assert.equal(calls.length, previous);
});
test("Storage sends bytes only to its fixed project and rejects failed uploads", async () => {
  const bytes = new TextEncoder().encode("test content");
  const storage = supabaseStorage(env, async (url, options) => {
    assert.equal(
      url,
      "https://example.supabase.co/storage/v1/object/diwan-files/files/test-file",
    );
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "text/plain");
    assert.equal(options.headers["x-upsert"], "false");
    assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(options.redirect, "error");
    assert.deepEqual(options.body, bytes);
    return new Response("", { status: 503 });
  });
  await assert.rejects(
    storage.put("files/test-file", bytes, {
      httpMetadata: { contentType: "text/plain" },
    }),
    /503/,
  );
});

test("Storage refuses unbounded bodies and oversized binary data before network access", async () => {
  let calls = 0;
  const storage = supabaseStorage(env, async () => {
    calls++;
    return new Response(null, { status: 200 });
  });
  for (const body of [
    new Blob(["x"]),
    new ReadableStream(),
    "x",
    { byteLength: 1 },
    null,
  ]) {
    await assert.rejects(storage.put("files/test", body), /bounded binary/);
  }
  await assert.rejects(
    storage.put("files/test", new Uint8Array(10485761)),
    /limit/,
  );
  assert.equal(calls, 0);
  await storage.put("files/test", new Uint8Array([1]));
  assert.equal(calls, 1);
});
