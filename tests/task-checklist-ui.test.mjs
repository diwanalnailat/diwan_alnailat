import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner } from "./support.mjs";

async function taskForm(configured = true) {
  const a = await fixture();
  if (configured)
    Object.assign(a.env, {
      AI_ENABLED: "true",
      OPENAI_API_KEY: "synthetic-only",
      OPENAI_MODEL: "offline-model",
    });
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#tasks",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document,
    reads = [],
    saves = [],
    errors = [];
  let pending = 0;
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  w.addEventListener("error", (e) => errors.push(e.error));
  w.fetch = async (path, options = {}) => {
    pending++;
    try {
      if (path === "/api/agent/task-checklist")
        return await new Promise((resolve) =>
          reads.push({ body: JSON.parse(options.body), resolve }),
        );
      if (path === "/api/tasks/save") saves.push(JSON.parse(options.body));
      return await worker.fetch(
        new Request(new URL(path, w.location.origin), {
          ...options,
          headers: {
            ...options.headers,
            origin: w.location.origin,
            "oai-authenticated-user-id": owner.id,
            "oai-authenticated-user-email": owner.email,
          },
        }),
        a.env,
      );
    } finally {
      pending--;
    }
  };
  const wait = async (condition) => {
    for (let i = 0; i < 350; i++) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error(
      `UI timeout: ${d.querySelector(".form-error")?.textContent} ${errors.map(String)}`,
    );
  };
  for (const file of [
    "permission-policy",
    "governance",
    "workspace",
    "workspace-views",
    "heritage-admin",
    "app",
  ])
    if (fs.existsSync(`public/${file}.js`))
      w.eval(fs.readFileSync(`public/${file}.js`, "utf8"));
  await wait(() => d.querySelector('[data-action="task-new"]') && !pending);
  d.querySelector('[data-action="task-new"]').click();
  await wait(() => d.querySelector(".task-editor"));
  const f = d.querySelector(".task-editor"),
    field = (name) => f.elements.namedItem(name);
  const set = (name, value) => {
    field(name).value = value;
    field(name).dispatchEvent(new w.Event("input", { bubbles: true }));
    field(name).dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const fill = () => {
    set("title", "تجهيز ضيافة المشروع");
    set("description", "تجهيز منطقة استقبال المشاركين حسب خطة اللجنة");
    set("outcome", "جاهزية المنطقة وإرفاق صور توثيق التنفيذ");
    set("assignee_id", a.member.memberId);
    set("due", "2027-01-20");
  };
  const result = (steps) => Response.json({ steps, requires_review: true });
  return {
    a,
    w,
    d,
    f,
    reads,
    saves,
    errors,
    wait,
    field,
    set,
    fill,
    result,
    settled: () => pending === 0,
    generate: () => f.querySelector("[data-task-checklist-generate]").click(),
    submit: () => f.querySelector('[type="submit"]').click(),
    async close() {
      for (const read of reads)
        read.resolve(result(["إعداد", "تنفيذ", "تحقق"]));
      await wait(() => !pending);
      dom.window.close();
      await a.DB.close();
    },
  };
}

test("task checklist automatically uses the three fields and saves reviewed edits only after explicit submission", async () => {
  const ui = await taskForm();
  try {
    ui.fill();
    await ui.wait(() => ui.reads.length === 1);
    assert.deepEqual(ui.reads[0].body, {
      committee_id: ui.a.cid,
      title: ui.field("title").value,
      description: ui.field("description").value,
      outcome: ui.field("outcome").value,
    });
    assert.equal(ui.saves.length, 0);
    ui.submit();
    await ui.wait(() => !ui.f.querySelector('[type="submit"]').disabled);
    assert.equal(
      ui.saves.length,
      0,
      "cannot save an unreviewed pending generation",
    );
    const generated = [
      "تحديد منطقة الاستقبال",
      "تجهيز الضيافة",
      "توثيق الجاهزية <script>bad()</script>",
    ];
    ui.reads[0].resolve(ui.result(generated));
    await ui.wait(() => !ui.f.taskChecklistBusy);
    assert.equal(ui.field("checklist_text").value, generated.join("\n"));
    assert.equal(ui.f.querySelector("[data-task-checklist] script"), null);
    assert.equal(
      ui.f.querySelector("#taskChecklistState").getAttribute("aria-busy"),
      "false",
    );
    ui.set(
      "checklist_text",
      generated.slice(0, 2).join("\n") + "\nفحص الجاهزية مع مسؤول اللجنة",
    );
    ui.submit();
    await ui.wait(() => ui.saves.length === 1 && ui.settled());
    const state = await ui.a.req("state");
    const task = state.data.tasks.find(
      (t) => t.title === ui.field("title").value,
    );
    assert.ok(task, JSON.stringify(ui.saves));
    assert.deepEqual(
      task.meta.checklist.map((step) => step.text),
      [
        "تحديد منطقة الاستقبال",
        "تجهيز الضيافة",
        "فحص الجاهزية مع مسؤول اللجنة",
      ],
    );
    assert.ok(
      task.meta.checklist.every((step) => step.id && step.done === false),
    );
    assert.deepEqual(ui.errors, []);
  } finally {
    await ui.close();
  }
});

test("late checklist responses preserve manual edits and latest task inputs; failures remain retryable", async () => {
  const ui = await taskForm();
  try {
    ui.fill();
    await ui.wait(() => ui.reads.length === 1);
    ui.set("title", "تجهيز ضيافة اليوم الثاني");
    await ui.wait(() => ui.reads.length === 2);
    ui.reads[1].resolve(
      ui.result(["خطة اليوم الثاني", "تجهيز الضيافة", "توثيق الجاهزية"]),
    );
    await ui.wait(() => !ui.f.taskChecklistBusy);
    ui.reads[0].resolve(ui.result(["خطة قديمة", "تجهيز قديم", "فحص قديم"]));
    await ui.wait(ui.settled);
    assert.match(ui.field("checklist_text").value, /^خطة اليوم الثاني/);
    ui.generate();
    await ui.wait(() => ui.reads.length === 3);
    ui.set("checklist_text", "خطوة أدخلها المستخدم");
    ui.reads[2].resolve(ui.result(["استبدال", "تجهيز", "تحقق"]));
    await ui.wait(ui.settled);
    assert.equal(ui.field("checklist_text").value, "خطوة أدخلها المستخدم");
    ui.generate();
    await ui.wait(() => ui.reads.length === 4);
    ui.reads[3].resolve(
      Response.json({ error: "الخدمة مشغولة" }, { status: 503 }),
    );
    await ui.wait(() => !ui.f.taskChecklistBusy);
    assert.match(
      ui.f.querySelector("#taskChecklistState").textContent,
      /الخدمة مشغولة/,
    );
    assert.equal(ui.field("checklist_text").value, "خطوة أدخلها المستخدم");
    ui.generate();
    await ui.wait(() => ui.reads.length === 5);
    ui.reads[4].resolve(
      ui.result(["تجهيز نهائي", "تنفيذ نهائي", "توثيق نهائي"]),
    );
    await ui.wait(() => !ui.f.taskChecklistBusy);
    assert.match(ui.field("checklist_text").value, /^تجهيز نهائي/);
    assert.equal(ui.saves.length, 0);
    assert.deepEqual(ui.errors, []);
  } finally {
    await ui.close();
  }
});

test("unconfigured Sanad keeps manual checklist entry and saving available without provider calls", async () => {
  const ui = await taskForm(false);
  try {
    ui.fill();
    ui.generate();
    assert.match(
      ui.f.querySelector("#taskChecklistState").textContent,
      /بانتظار تفعيل/,
    );
    assert.equal(ui.reads.length, 0);
    ui.set("checklist_text", "خطوة تنفيذ يدوية\nفحص جودة التنفيذ");
    ui.submit();
    await ui.wait(() => ui.saves.length === 1 && ui.settled());
    assert.equal(ui.reads.length, 0);
    const state = await ui.a.req("state");
    assert.equal(state.data.tasks.length, 1);
    assert.equal(
      state.data.tasks[0].meta.checklist[0].text,
      "خطوة تنفيذ يدوية",
    );
    assert.deepEqual(ui.errors, []);
  } finally {
    await ui.close();
  }
});
