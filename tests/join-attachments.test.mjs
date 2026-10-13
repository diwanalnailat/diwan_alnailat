import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { app, addMember } from "./support.mjs";
import worker from "../worker.js";
import { joinPublicEndpoint } from "../lib/join-public.js";
import {
  attachmentManifest,
  storeJoinAttachments,
} from "../lib/join-attachments.js";
import {
  JOIN_ATTESTATION,
  JOIN_MAX_BYTES,
} from "../lib/join-attachment-policy.js";

test("optional join files are OTP-bound, all-format, privately stored and only administration can download", async () => {
  const a = await app();
  await a.req("state?view=services");
  const outsider = await addMember(a, "UnrelatedReviewer", []);
  const objects = new Map(),
    messages = [];
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
      put: async (key, bytes) => objects.set(key, bytes),
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
  const files = [
    {
      kind: "identity",
      file: new File(["synthetic identity"], "identity.custom", {
        type: "application/x-unlisted",
      }),
    },
    {
      kind: "experience",
      file: new File(["<script>synthetic()</script>"], "experience.html", {
        type: "text/html",
      }),
    },
  ];
  const manifest = await Promise.all(
    files.map(async ({ kind, file }) => ({
      kind,
      name: file.name,
      size: file.size,
      sha256: createHash("sha256")
        .update(new Uint8Array(await file.arrayBuffer()))
        .digest("hex"),
    })),
  );
  const data = {
    name: "Test Applicant",
    phone: "+966500000041",
    reason: "Test membership application",
    consent: true,
    attestation: true,
    policy_version: 0,
    attachments: manifest,
  };
  const request = (body) =>
    new Request("https://diwan.test/auth/join/request", {
      method: "POST",
      headers: {
        origin: "https://diwan.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await joinPublicEndpoint(
        request({ ...data, attestation: false }),
        env,
        "request",
      )
    ).status,
    400,
  );
  assert.equal(messages.length, 0);
  const start = await joinPublicEndpoint(request(data), env, "request");
  assert.equal(start.status, 200);
  const challenge = (await start.json()).challenge_id;
  const cookie = start.headers.get("set-cookie").split(";")[0];
  const code = messages[0].message.match(/\b\d{6}\b/)[0];
  const verify = (items = files, binding = cookie) => {
    const form = new FormData();
    form.set("challenge_id", challenge);
    form.set("code", code);
    for (const item of items) form.append(item.kind, item.file);
    return new Request("https://diwan.test/auth/join/verify", {
      method: "POST",
      headers: { origin: "https://diwan.test", cookie: binding },
      body: form,
    });
  };
  assert.equal(
    (await joinPublicEndpoint(verify(files, ""), env, "verify")).status,
    400,
  );
  assert.equal(
    (await joinPublicEndpoint(verify([]), env, "verify")).status,
    400,
  );
  assert.equal(objects.size, 0);
  const tampered = [
    { ...files[0], file: new File(["different contents"], files[0].file.name) },
    files[1],
  ];
  assert.equal(
    (await joinPublicEndpoint(verify(tampered), env, "verify")).status,
    400,
  );
  assert.equal(objects.size, 0);
  const approvedBody = await joinPublicEndpoint(verify(), env, "verify");
  assert.equal(
    approvedBody.status,
    200,
    JSON.stringify(await approvedBody.json()),
  );
  assert.equal(objects.size, 2);
  assert.equal(a.objects.size, 0);
  const application = (await a.req("join-requests")).data.requests[0];
  assert.equal(application.attestation.text, JOIN_ATTESTATION);
  assert.ok(application.attestation.accepted_at);
  const detail = (await a.req("join-requests?id=" + application.id)).data;
  assert.equal(detail.attachments.length, 2);
  assert.ok(detail.attachments.every((f) => !f.object_key && !f.sha256));
  assert.equal(
    (await a.req("join-requests?id=" + application.id, undefined, outsider))
      .data.attachments.length,
    0,
  );
  for (const file of detail.attachments) {
    const response = await worker.fetch(
      new Request("https://diwan.test/api/files/" + file.id + "?inline=1", {
        headers: {
          "oai-authenticated-user-id": "site-owner",
          "oai-authenticated-user-email": "owner@example.test",
        },
      }),
      a.env,
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("content-type"),
      "application/octet-stream",
    );
    assert.match(response.headers.get("content-disposition"), /^attachment;/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      (await a.req("files/" + file.id, undefined, outsider)).status,
      403,
    );
  }
  assert.equal((await joinPublicEndpoint(verify(), env, "verify")).status, 400);
  assert.equal(objects.size, 2);
});

test("join attachments enforce aggregate bounds and clean partial uploads without deleting committed objects", async () => {
  const f = {
    kind: "identity",
    name: "fixture.bin",
    size: 1,
    sha256: "a".repeat(64),
  };
  assert.deepEqual(attachmentManifest(), []);
  assert.throws(
    () => attachmentManifest([{ ...f, size: JOIN_MAX_BYTES + 1 }]),
    { status: 413 },
  );
  assert.throws(() => attachmentManifest(Array(7).fill(f)), { status: 400 });
  assert.throws(() => attachmentManifest([{ ...f, name: "../private" }]), {
    status: 400,
  });
  const objects = new Map();
  const bucket = {
    put: async (key, bytes) => {
      objects.set(key, bytes);
      throw new Error("storage failure");
    },
    delete: async (key) => objects.delete(key),
  };
  const manifest = [
    { ...f, sha256: createHash("sha256").update("x").digest("hex") },
  ];
  const files = [{ kind: "identity", file: new File(["x"], "fixture.bin") }];
  await assert.rejects(
    storeJoinAttachments(
      { JOIN_BUCKET: bucket },
      { id: "test" },
      manifest,
      files,
    ),
    /storage failure/,
  );
  assert.equal(objects.size, 0);
  bucket.put = async (key, bytes) => objects.set(key, bytes);
  const a = await app();
  const saved = await storeJoinAttachments(
    { ...a.env, JOIN_BUCKET: bucket },
    { id: "test" },
    manifest,
    files,
  );
  await saved.cleanup(true);
  assert.equal(objects.size, 0);
  const committed = await storeJoinAttachments(
    { ...a.env, JOIN_BUCKET: bucket },
    { id: "test" },
    manifest,
    files,
  );
  await a.DB.batch(committed.statements);
  await committed.cleanup(true);
  assert.equal(objects.size, 1);
});
