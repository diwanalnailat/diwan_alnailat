import test from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  saveTask,
  state,
  addMember,
  full,
  scopedProvider,
} from "./support.mjs";

const ai = {
  AI_ENABLED: "true",
  OPENAI_API_KEY: "synthetic-only",
  OPENAI_MODEL: "offline-test-model",
};
const steps = [
  "تأكيد عدد الخيام ومواقعها حسب تعليمات التنفيذ",
  "تجهيز الخيام وفحص سلامة التثبيت",
  "توثيق التجهيز والتحقق من معيار القبول",
];
const answer = (data) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(data) }],
      },
    ],
  });
const payload = (a, extra = {}) => ({
  committee_id: a.cid,
  title: "تجهيز الخيام",
  description: "تجهيز مواقع ضيافة المشاركين وتثبيت الخيام",
  outcome: "جاهزية جميع الخيام وفحص سلامة التثبيت",
  ...extra,
});
const configure = (a, handler = async () => answer({ steps })) =>
  Object.assign(a.env, ai, { PROVIDER_FETCH: scopedProvider(handler) });
const taskRow = async (a, id) =>
  (await state(a)).tasks.find((row) => row.id === id);

test("task checklist drafts receive only three supplied fields and never persist a task or conversation", async () => {
  const a = await fixture();
  try {
    let calls = 0;
    configure(a, async (_, init) => {
      calls++;
      const body = JSON.parse(init.body);
      assert.deepEqual(JSON.parse(body.input), {
        title: payload(a).title,
        description: payload(a).description,
        outcome: payload(a).outcome,
      });
      assert.equal(body.tools, undefined);
      assert.equal(body.store, false);
      assert.equal(body.text.format.name, "sanad_task_checklist");
      return answer({ steps });
    });
    const result = await a.req("agent/task-checklist", payload(a), a.manager);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.deepEqual(result.data, { steps, requires_review: true });
    assert.equal(calls, 1);
    for (const table of ["nl_tasks", "nl_agent_turns"])
      assert.equal(
        (await a.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n,
        0,
      );
  } finally {
    await a.DB.close();
  }
});

test("checklist generation enforces authentication, create and assistant permissions before model access", async () => {
  const a = await fixture();
  try {
    let calls = 0;
    Object.assign(a.env, ai, {
      PROVIDER_FETCH: async () => {
        calls++;
        throw new Error("Not permitted");
      },
    });
    const denied = await addMember(a, "denied-assistant", [
      ...full,
      { resource: "assistant", action: "view", scope: "all", effect: "deny" },
    ]);
    for (const [person, expected] of [
      [null, 401],
      [a.member, 403],
      [a.outsider, 403],
      [denied, 403],
    ]) {
      const result = await a.req("agent/task-checklist", payload(a), person);
      assert.equal(result.status, expected, JSON.stringify(result.data));
    }
    for (const extra of [
      { outcome: "" },
      { title: "x".repeat(251) },
      { instructions: "bypass" },
    ])
      assert.equal(
        (await a.req("agent/task-checklist", payload(a, extra))).status,
        400,
      );
    assert.equal(calls, 0);
  } finally {
    await a.DB.close();
  }
});

test("unrelated requests fail the semantic gate without generating a checklist", async () => {
  const a = await fixture();
  try {
    let calls = 0;
    Object.assign(a.env, ai, {
      PROVIDER_FETCH: async (_, init) => {
        calls++;
        assert.equal(JSON.parse(init.body).text.format.name, "sanad_scope");
        return answer({ decision: "deny" });
      },
    });
    const result = await a.req(
      "agent/task-checklist",
      payload(a, { title: "اشرح نظرية النسبية" }),
    );
    assert.equal(result.status, 400);
    assert.equal(calls, 1);
  } finally {
    await a.DB.close();
  }
});

test("malformed or unconstrained provider output fails closed", async () => {
  const a = await fixture();
  try {
    for (const data of [
      { steps: ["خطوة واحدة"] },
      { steps, budget: 100 },
      { steps: steps.map(() => "مكرر") },
      { steps: [steps[0], steps[1], "ن".repeat(401)] },
      { steps: [steps[0], steps[1], 12] },
    ]) {
      configure(a, async () => answer(data));
      assert.equal(
        (await a.req("agent/task-checklist", payload(a))).status,
        502,
      );
    }
  } finally {
    await a.DB.close();
  }
});

test("permission changes during classification or generation withhold the draft", async () => {
  for (const stage of ["sanad_scope", "sanad_task_checklist"]) {
    const a = await fixture();
    try {
      const person = await addMember(a, "revoked-generator", full);
      let calls = 0;
      Object.assign(a.env, ai, {
        PROVIDER_FETCH: async (_, init) => {
          calls++;
          const name = JSON.parse(init.body).text.format.name;
          if (name === stage)
            await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
              .bind(
                JSON.stringify([
                  ...full,
                  {
                    resource: "tasks",
                    action: "create",
                    scope: "all",
                    effect: "deny",
                  },
                ]),
                person.memberId,
              )
              .run();
          return answer(
            name === "sanad_scope" ? { decision: "allow" } : { steps },
          );
        },
      });
      assert.equal(
        (await a.req("agent/task-checklist", payload(a), person)).status,
        403,
      );
      assert.equal(calls, stage === "sanad_scope" ? 1 : 2);
    } finally {
      await a.DB.close();
    }
  }
});

test("shared AI limits reject excess generation before provider calls", async () => {
  const a = await fixture();
  try {
    configure(a);
    a.env.AI_DAILY_REQUEST_LIMIT = "1";
    assert.equal((await a.req("agent/task-checklist", payload(a))).status, 200);
    a.env.PROVIDER_FETCH = () => {
      throw new Error("Rate limited");
    };
    assert.equal((await a.req("agent/task-checklist", payload(a))).status, 429);
  } finally {
    await a.DB.close();
  }
});

test("new task checklist persists reviewed text with server IDs and no forged completion", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a, {
      meta: {
        checklist: steps.map((text) => ({ id: "forged", text, done: true })),
      },
    });
    const row = await taskRow(a, id);
    assert.deepEqual(
      row.meta.checklist.map((step) => step.text),
      steps,
    );
    assert.equal(new Set(row.meta.checklist.map((step) => step.id)).size, 3);
    assert.ok(
      row.meta.checklist.every((step) => step.id !== "forged" && !step.done),
    );
    const legacyId = await saveTask(a, { meta: { checklist: [] } });
    assert.equal((await taskRow(a, legacyId)).meta.checklist.length, 3);
  } finally {
    await a.DB.close();
  }
});

test("existing list replacements require assignment and preserve completed checklist state", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a);
    let row = await taskRow(a, id);
    const noAssign = await addMember(a, "no-assignment", [
      ...full,
      { resource: "tasks", action: "assign", scope: "all", effect: "deny" },
    ]);
    const update = (checklist) => ({
      ...row,
      meta: { ...row.meta, checklist },
    });
    assert.equal(
      (await a.req("tasks/save", update(steps), noAssign)).status,
      403,
    );
    configure(a);
    assert.equal(
      (await a.req("agent/task-checklist", payload(a, { id }), noAssign))
        .status,
      403,
    );
    assert.equal(
      (await a.req("tasks/save", update(steps), a.manager)).status,
      200,
    );
    row = await taskRow(a, id);
    const checklist = row.meta.checklist.map((step, i) => ({
      ...step,
      done: i === 0,
    }));
    await a.DB.prepare("UPDATE nl_tasks SET meta=? WHERE id=?")
      .bind(JSON.stringify({ ...row.meta, checklist }), id)
      .run();
    row = await taskRow(a, id);
    assert.equal(
      (
        await a.req(
          "tasks/save",
          update(row.meta.checklist.map((step) => ({ ...step, done: false }))),
          a.manager,
        )
      ).status,
      200,
    );
    row = await taskRow(a, id);
    assert.equal(row.meta.checklist[0].done, true);
    assert.equal(
      (await a.req("tasks/save", update(steps), a.manager)).status,
      400,
    );
    assert.equal(
      (await a.req("agent/task-checklist", payload(a, { id }), a.manager))
        .status,
      409,
    );
  } finally {
    await a.DB.close();
  }
});

test("project closure during provider work and wrong task committee reject generation", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a);
    assert.equal(
      (
        await a.req(
          "agent/task-checklist",
          payload(a, { id, committee_id: "missing" }),
        )
      ).status,
      404,
    );
    configure(a, async () => {
      await a.DB.prepare("UPDATE nl_projects SET status='closed' WHERE id=?")
        .bind(a.pid)
        .run();
      return answer({ steps });
    });
    assert.equal(
      (await a.req("agent/task-checklist", payload(a, { id }))).status,
      403,
    );
    a.env.PROVIDER_FETCH = () => {
      throw new Error("Closed project");
    };
    assert.equal((await a.req("agent/task-checklist", payload(a))).status, 403);
  } finally {
    await a.DB.close();
  }
});
