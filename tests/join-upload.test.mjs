import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { app, addMember, owner } from "./support.mjs";
import worker from "../worker.js";
import { joinPublicEndpoint } from "../lib/join-public.js";
import { cleanupExpiredJoinUploads } from "../lib/join-upload.js";
import { attachmentManifest } from "../lib/join-attachments.js";
import {
  JOIN_CHUNK_BYTES,
  JOIN_FILE_MAX_BYTES,
  JOIN_MAX_BYTES,
} from "../lib/join-attachment-policy.js";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("large join files resume after OTP, store losslessly, finalize once and remain admin-only", async () => {
  const a = await app();
  await a.req("state?view=services");
  const outsider = await addMember(a, "ChunkOutsider", []);
  const objects = new Map(),
    messages = [];
  let failPut = false;
  const env = {
    ...a.env,
    NODE_ENV: "production",
    APP_BASE_URL: "https://diwan.test",
    WHATSAPP_ENABLED: "true",
    WHATSAPP_PROVIDER: "green_api",
    GREEN_API_URL: "https://7107.api.greenapi.com",
    GREEN_API_INSTANCE: "1234567890",
    GREEN_API_TOKEN: "test-token-not-a-real-credential",
    OTP_SECRET: "a".repeat(48),
    JOIN_BUCKET: {
      put: async (key, bytes) => {
        objects.set(key, bytes);
        if (failPut) throw new Error("fixture unavailable");
      },
      get: async (key) =>
        objects.has(key) ? { body: objects.get(key) } : null,
      delete: async (key) => objects.delete(key),
    },
    PROVIDER_FETCH: async (_, options) => {
      messages.push(JSON.parse(options.body));
      return Response.json({ idMessage: "fixture" });
    },
  };
  Object.assign(a.env, env);
  const originals = [Buffer.alloc(5 * 1024 * 1024 + 7, 65), randomBytes(1024)];
  const chunks = originals.map((bytes) => {
    const parts = [];
    for (let i = 0; i < bytes.length; i += JOIN_CHUNK_BYTES)
      parts.push(bytes.subarray(i, i + JOIN_CHUNK_BYTES));
    return parts;
  });
  const attachments = originals.map((bytes, index) => ({
    kind: index ? "experience" : "identity",
    name: index ? "experience.anything" : "identity.pdf",
    size: bytes.length,
    parts: chunks[index].map(sha),
  }));
  let cookie = "",
    challenge = "",
    uploadToken = "";
  const call = (action, body, override = {}) =>
    joinPublicEndpoint(
      new Request(`https://diwan.test/auth/join/${action}`, {
        method: "POST",
        headers: {
          origin: "https://diwan.test",
          cookie,
          "x-join-challenge": challenge,
          "x-join-upload": uploadToken,
          "content-type":
            body instanceof Uint8Array
              ? "application/octet-stream"
              : "application/json",
          ...override,
        },
        body: body instanceof Uint8Array ? body : JSON.stringify(body || {}),
      }),
      env,
      action.split("?")[0],
    );
  const start = await call("request", {
    name: "Synthetic Applicant",
    phone: "+966500000042",
    reason: "Synthetic membership request",
    consent: true,
    attestation: true,
    policy_version: 0,
    attachments,
  });
  assert.equal(start.status, 200);
  challenge = (await start.json()).challenge_id;
  cookie = start.headers.get("set-cookie").split(";")[0];
  assert.equal((await call("chunk?file=0&part=0", chunks[0][0])).status, 403);
  const credentials = {
    challenge_id: challenge,
    code: messages[0].message.match(/\b\d{6}\b/)[0],
    upload_mode: "chunked",
  };
  const verified = await call("verify", credentials);
  assert.equal(
    verified.status,
    200,
    JSON.stringify(await verified.clone().json()),
  );
  uploadToken = (await verified.json()).upload_token;
  assert.equal(
    (await (await call("verify", credentials)).json()).upload_token,
    uploadToken,
    "lost verify response is retryable",
  );
  assert.equal((await a.req("join-requests")).data.requests.length, 0);
  assert.equal(
    (await call("chunk?file=0&part=0", chunks[0][0], { cookie: "" })).status,
    403,
  );
  assert.equal(
    (
      await call("chunk?file=0&part=0", chunks[0][0], {
        origin: "https://other.test",
      })
    ).status,
    403,
  );
  assert.equal((await call("chunk?file=99&part=0", chunks[0][0])).status, 400);
  assert.equal(
    (await call("chunk?file=0&part=0", new Uint8Array(JOIN_CHUNK_BYTES + 1)))
      .status,
    413,
  );
  assert.equal(
    (await call("chunk?file=0&part=0", new Uint8Array(JOIN_CHUNK_BYTES)))
      .status,
    400,
  );
  const duplicate = await Promise.all([
    call("chunk?file=0&part=0", chunks[0][0]),
    call("chunk?file=0&part=0", chunks[0][0]),
  ]);
  assert.ok(duplicate.every((r) => r.status === 200));
  assert.equal(objects.size, 1, "concurrent duplicate stores one object");
  assert.ok([...objects.values()][0].length < chunks[0][0].length);
  const draft = await a.DB.prepare(
    "SELECT id FROM nl_files WHERE entity_type='join_upload'",
  ).first();
  assert.equal(
    (await a.req("files/" + draft.id)).status,
    403,
    "admin cannot fetch internal parts",
  );
  assert.equal((await call("complete")).status, 409);
  assert.equal((await a.req("join-requests")).data.requests.length, 0);
  failPut = true;
  assert.equal((await call("chunk?file=0&part=1", chunks[0][1])).status, 503);
  assert.equal(objects.size, 1, "failed partial put cleaned");
  failPut = false;
  assert.deepEqual((await (await call("upload-status")).json()).uploaded, [
    [0, 0],
  ]);
  assert.equal((await call("chunk?file=0&part=1", chunks[0][1])).status, 200);
  assert.equal((await call("chunk?file=1&part=0", chunks[1][0])).status, 200);
  const stored = (
    await a.DB.prepare(
      "SELECT meta FROM nl_files WHERE entity_type='join_upload'",
    ).all()
  ).results.map((r) => JSON.parse(r.meta));
  assert.ok(stored.some((m) => m.encoding === "gzip"));
  assert.ok(
    stored.some((m) => m.encoding === "raw"),
    "incompressible data stays original size",
  );
  assert.equal((await call("complete")).status, 200);
  const noticeCount = (
    await a.DB.prepare("SELECT count(*) AS n FROM nl_notifications").first()
  ).n;
  assert.equal((await call("complete")).status, 200);
  assert.equal(
    (await a.DB.prepare("SELECT count(*) AS n FROM nl_notifications").first())
      .n,
    noticeCount,
  );
  assert.equal((await (await call("upload-status")).json()).complete, true);
  assert.equal((await call("chunk?file=0&part=0", chunks[0][0])).status, 409);
  const request = (await a.req("join-requests")).data.requests[0];
  const detail = (await a.req("join-requests?id=" + request.id)).data;
  assert.equal(detail.attachments.length, 2);
  const download = (id) =>
    worker.fetch(
      new Request("https://diwan.test/api/files/" + id, {
        headers: {
          "oai-authenticated-user-id": owner.id,
          "oai-authenticated-user-email": owner.email,
        },
      }),
      a.env,
    );
  for (const file of detail.attachments) {
    const index = file.name === attachments[0].name ? 0 : 1;
    assert.equal(
      (await a.req("files/" + file.id, undefined, outsider)).status,
      403,
    );
    const response = await download(file.id);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      response.headers.get("content-type"),
      "application/octet-stream",
    );
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      originals[index],
      "original bytes restored exactly",
    );
  }
  assert.equal((await a.req("files/" + draft.id)).status, 403);
  objects.set("files/expired-fixture", new Uint8Array([1]));
  await a.DB.prepare(
    "INSERT INTO nl_files(id,entity_type,entity_id,meta,name,mime,size,object_key,created_by,created) VALUES('expired','join_upload','abandoned','{}','fixture','application/octet-stream',1,'files/expired-fixture','applicant:abandoned','2020-01-01T00:00:00.000Z')",
  ).run();
  await cleanupExpiredJoinUploads(env);
  assert.equal(objects.has("files/expired-fixture"), false);
  assert.equal(objects.size, 3, "completed originals retained");
  await a.DB.prepare("UPDATE nl_otp SET expires=0 WHERE id=?")
    .bind(challenge)
    .run();
  assert.equal((await call("upload-status")).status, 410);
  const logical = await a.DB.prepare(
    "SELECT * FROM nl_files WHERE entity_type='join_requests' AND name='identity.pdf'",
  ).first();
  objects.set(JSON.parse(logical.meta).chunks[0].key, new Uint8Array([0]));
  await assert.rejects(
    async () => (await download(logical.id)).arrayBuffer(),
    "corrupt storage cannot silently return a damaged original",
  );
});

test("chunk manifests bound per-file and aggregate sizes and require exact part checksums", () => {
  const file = {
    kind: "experience",
    name: "fixture.pdf",
    size: JOIN_FILE_MAX_BYTES,
    parts: Array(Math.ceil(JOIN_FILE_MAX_BYTES / JOIN_CHUNK_BYTES)).fill(
      "a".repeat(64),
    ),
  };
  assert.equal(
    attachmentManifest([file, file, file]).reduce((sum, f) => sum + f.size, 0),
    JOIN_MAX_BYTES,
  );
  assert.throws(() => attachmentManifest([file, file, file, file]), {
    status: 413,
  });
  assert.throws(
    () => attachmentManifest([{ ...file, size: JOIN_FILE_MAX_BYTES + 1 }]),
    { status: 413 },
  );
  assert.throws(
    () => attachmentManifest([{ ...file, parts: ["a".repeat(64)] }]),
    { status: 400 },
  );
  assert.throws(
    () =>
      attachmentManifest([{ ...file, parts: "bad", sha256: "a".repeat(64) }]),
    { status: 400 },
  );
});
