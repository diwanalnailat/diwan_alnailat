import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import { fixture, saveTask, upload, owner } from "./support.mjs";

const ok = (result) =>
  assert.equal(result.status, 200, JSON.stringify(result.data));
const row = (a, id) =>
  a.DB.prepare("SELECT * FROM nl_tasks WHERE id=?").bind(id).first();
const fileRow = (a, id) =>
  a.DB.prepare("SELECT * FROM nl_files WHERE id=?").bind(id).first();

test("task review requires authorized proof, accepts arbitrary file types, and binds proof atomically", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a),
      other = await saveTask(a);
    let task = await row(a, id);
    ok(
      await a.req(
        "tasks/transition",
        { id, version: task.version, status: "doing" },
        a.member,
      ),
    );
    task = await row(a, id);
    for (const step of JSON.parse(task.meta).checklist) {
      ok(
        await a.req(
          "tasks/checklist",
          { id, item_id: step.id, done: true, version: task.version },
          a.member,
        ),
      );
      task = await row(a, id);
    }
    const submit = (files = [], version = task.version) =>
      a.req(
        "tasks/transition",
        {
          id,
          version,
          status: "review",
          note: "اكتمل تنفيذ المهمة",
          files,
        },
        a.member,
      );
    let result = await submit();
    assert.equal(result.status, 400);
    assert.match(result.data.error, /أرفق إثبات الإنجاز/);
    assert.deepEqual(await row(a, id), task);

    await upload(a, "tasks", "reference", a.member, { entity: id });
    const reference = await upload(a, "tasks", "reference", a.member, {
      entity: id,
      attach_later: "true",
    });
    assert.equal((await submit([reference])).status, 400);
    assert.equal((await fileRow(a, reference)).entity_type, "draft");
    const wrongOwner = await upload(a, "tasks", "proof", owner, {
      entity: id,
      attach_later: "true",
    });
    assert.equal((await submit([wrongOwner])).status, 403);
    const wrongTask = await upload(a, "tasks", "proof", a.member, {
      entity: other,
      attach_later: "true",
    });
    assert.equal((await submit([wrongTask])).status, 403);
    const legacyMeta = JSON.parse((await fileRow(a, wrongTask)).meta);
    delete legacyMeta.task_upload;
    await a.DB.prepare("UPDATE nl_files SET meta=? WHERE id=?")
      .bind(JSON.stringify(legacyMeta), wrongTask)
      .run();
    assert.equal(
      (await submit([wrongTask])).status,
      403,
      "older staged proof retains its original task scope",
    );
    const wrongResource = await upload(a, "tasks", "proof", a.member, {
      entity: id,
      attach_later: "true",
    });
    const wrongResourceMeta = JSON.parse(
      (await fileRow(a, wrongResource)).meta,
    );
    wrongResourceMeta.pending_resource = "assets";
    await a.DB.prepare("UPDATE nl_files SET meta=? WHERE id=?")
      .bind(JSON.stringify(wrongResourceMeta), wrongResource)
      .run();
    assert.equal((await submit([wrongResource])).status, 403);
    assert.equal((await submit(["missing-proof"])).status, 403);
    assert.deepEqual(await row(a, id), task);

    const body = new TextEncoder().encode("synthetic task deliverable");
    const start = await a.req(
      "task-uploads/start",
      {
        name: "deliverable.custom",
        size: body.length,
        purpose: "proof",
        entity_id: id,
        attach_later: true,
      },
      a.member,
    );
    ok(start);
    const proof = start.data;
    const response = await worker.fetch(
      new Request(`https://diwan.test/api/task-uploads/${proof.id}/parts/0`, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/octet-stream",
          origin: "https://diwan.test",
          "oai-authenticated-user-id": a.member.id,
          "oai-authenticated-user-email": a.member.email,
        },
      }),
      a.env,
    );
    assert.equal(response.status, 200, await response.text());
    ok(await a.req(`task-uploads/${proof.id}/complete`, {}, a.member));
    assert.equal((await submit([proof.id], task.version - 1)).status, 409);
    assert.equal((await fileRow(a, proof.id)).entity_type, "draft");
    assert.deepEqual(await row(a, id), task);
    ok(await submit([proof.id]));
    assert.equal((await fileRow(a, proof.id)).entity_id, id);
    assert.equal((await fileRow(a, proof.id)).entity_type, "tasks");
    task = await row(a, id);
    assert.equal(task.status, "review");
    ok(
      await a.req(
        "tasks/transition",
        {
          id,
          version: task.version,
          status: "doing",
          note: "استكمال المراجعة",
        },
        a.manager,
      ),
    );
    task = await row(a, id);
    ok(await submit());
    assert.equal(
      (await row(a, id)).status,
      "review",
      "existing authorized task proof is reusable",
    );
  } finally {
    await a.DB.close();
  }
});
