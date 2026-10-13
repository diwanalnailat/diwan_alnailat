import test from "node:test";
import assert from "node:assert/strict";
import { fixture, state, saveTask } from "./support.mjs";

test("retired tags are ignored on task writes and omitted from legacy committee/task responses", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a, {
      meta: { tags: ["unapproved-retired-label"] },
    });
    let stored = await a.DB.prepare("SELECT meta FROM nl_tasks WHERE id=?")
      .bind(id)
      .first();
    assert.equal(Object.hasOwn(JSON.parse(stored.meta), "tags"), false);
    const committee = await a.DB.prepare(
      "SELECT config FROM nl_committees WHERE id=?",
    )
      .bind(a.cid)
      .first();
    await a.DB.prepare("UPDATE nl_committees SET config=? WHERE id=?")
      .bind(
        JSON.stringify({
          ...JSON.parse(committee.config),
          tags: ["legacy-label"],
        }),
        a.cid,
      )
      .run();
    await a.DB.prepare("UPDATE nl_tasks SET meta=? WHERE id=?")
      .bind(
        JSON.stringify({ ...JSON.parse(stored.meta), tags: ["legacy-label"] }),
        id,
      )
      .run();
    const visible = await state(a);
    assert.equal(
      Object.hasOwn(
        visible.committees.find((c) => c.id === a.cid).config,
        "tags",
      ),
      false,
    );
    const task = visible.tasks.find((t) => t.id === id);
    assert.equal(Object.hasOwn(task.meta, "tags"), false);
    const detail = await a.req("tasks/" + id, undefined, a.member);
    assert.equal(detail.status, 200);
    assert.equal(Object.hasOwn(detail.data.task.meta, "tags"), false);
    await saveTask(a, {
      ...task,
      meta: { ...task.meta, tags: "obsolete client value" },
    });
    stored = await a.DB.prepare("SELECT meta FROM nl_tasks WHERE id=?")
      .bind(id)
      .first();
    assert.equal(Object.hasOwn(JSON.parse(stored.meta), "tags"), false);
  } finally {
    await a.DB.close();
  }
});
