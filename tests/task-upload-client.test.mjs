import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Exercise the production transport without initializing the whole workspace.
const source = fs.readFileSync("public/app.js", "utf8");
const transport = source.slice(
  source.indexOf("  const taskUploadSessions ="),
  source.indexOf("  async function uploadFiles("),
);
const client = (fetch) =>
  new Function("fetch", `${transport}\nreturn uploadTaskFile;`)(fetch);
const scope = {
  entity_id: "task",
  project_id: "project",
  committee_id: "committee",
  purpose: "proof",
  attach_later: false,
};

test("task upload slices binary files and retries the same numbered part without repeating successful parts", async () => {
  const calls = [],
    progress = [];
  let fail = true;
  const upload = client(async (path, request) => {
    calls.push({
      path,
      body:
        request.body instanceof Blob
          ? [...new Uint8Array(await request.body.arrayBuffer())]
          : JSON.parse(request.body),
      headers: request.headers,
    });
    if (path.endsWith("/start"))
      return Response.json({ id: "upload-a", parts: 3, chunk_bytes: 3 });
    if (path.endsWith("/parts/1") && fail) {
      fail = false;
      return Response.json({ error: "temporary" }, { status: 503 });
    }
    return Response.json(
      path.endsWith("/complete") ? { id: "file-a" } : { ok: true },
    );
  });
  const file = new File(
    [Uint8Array.from([0, 255, 17, 42, 0, 19, 88])],
    "proof.unlisted",
    { type: "application/x-custom" },
  );
  assert.equal(
    await upload(file, scope, (value) => progress.push(value)),
    "file-a",
  );
  assert.deepEqual(
    calls.map((call) => call.path),
    [
      "/api/task-uploads/start",
      "/api/task-uploads/upload-a/parts/0",
      "/api/task-uploads/upload-a/parts/1",
      "/api/task-uploads/upload-a/parts/1",
      "/api/task-uploads/upload-a/parts/2",
      "/api/task-uploads/upload-a/complete",
    ],
  );
  assert.deepEqual(
    calls.slice(1, 5).map((call) => call.body),
    [[0, 255, 17], [42, 0, 19], [42, 0, 19], [88]],
  );
  assert.equal(calls[1].headers["Content-Type"], "application/octet-stream");
  assert.equal(calls[0].body.name, "proof.unlisted");
  assert.equal(calls[0].body.size, 7);
  assert.deepEqual(progress, [43, 86, 100]);
});

test("retrying a failed upload retains its session and resumes at the failed chunk", async () => {
  let starts = 0,
    unavailable = true;
  const parts = [];
  const upload = client(async (path) => {
    if (path.endsWith("/start")) {
      starts++;
      return Response.json({ id: "retained", parts: 2, chunk_bytes: 2 });
    }
    if (path.endsWith("/complete")) return Response.json({ id: "saved" });
    parts.push(path);
    return path.endsWith("/1") && unavailable
      ? Response.json({ error: "temporary" }, { status: 503 })
      : Response.json({ ok: true });
  });
  const file = new File(["abcd"], "evidence.zip");
  await assert.rejects(
    upload(file, scope, () => {}),
    /temporary/,
  );
  assert.equal(parts.filter((path) => path.endsWith("/1")).length, 3);
  unavailable = false;
  assert.equal(await upload(file, scope, () => {}), "saved");
  assert.equal(starts, 1);
  assert.equal(parts.filter((path) => path.endsWith("/0")).length, 1);
  assert.equal(parts.at(-1), "/api/task-uploads/retained/parts/1");
});

test("oversized task files fail before any network request or slicing", async () => {
  let requests = 0;
  const upload = client(async () => {
    requests++;
    throw Error("must not send");
  });
  await assert.rejects(
    upload(
      {
        size: 1024 ** 3 + 1,
        slice() {
          throw Error("must not slice");
        },
      },
      scope,
      () => {},
    ),
    /1 غيغابايت/,
  );
  assert.equal(requests, 0);
});
