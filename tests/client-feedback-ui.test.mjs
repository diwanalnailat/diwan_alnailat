import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner, saveTask, upload } from "./support.mjs";

test("task guide generates reviewed steps in place, preserves edits and returns to its task", async () => {
  const a = await fixture();
  Object.assign(a.env, {
    AI_ENABLED: "true",
    OPENAI_API_KEY: "synthetic",
    OPENAI_MODEL: "offline",
  });
  const id = await saveTask(a, { title: "تجهيز الضيافة" });
  await a.DB.prepare("UPDATE nl_tasks SET status='doing' WHERE id=?")
    .bind(id)
    .run();
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#tasks",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document,
    reads = [],
    writes = [],
    errors = [];
  let pending = 0;
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.addEventListener("error", (event) => errors.push(event.error));
  w.fetch = async (path, options = {}) => {
    pending++;
    try {
      if (path === "/api/agent/task-guide")
        return await new Promise((resolve) =>
          reads.push({ body: JSON.parse(options.body), resolve }),
        );
      if (options.method === "POST") writes.push(path);
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
      `UI timeout: ${d.querySelector("#toast").textContent} ${errors}`,
    );
  };
  try {
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
    await wait(
      () =>
        d.querySelector(`[data-action="task"][data-id="${id}"]`) && !pending,
    );
    d.querySelector(`[data-action="task"][data-id="${id}"]`).click();
    await wait(() => d.querySelector('[data-action="task-guide"]') && !pending);
    d.querySelector('[data-action="task-guide"]').click();
    await wait(() => reads.length === 1);
    const form = d.querySelector("#guideForm");
    assert.equal(reads[0].body.id, id);
    assert.equal(reads[0].body.committee_id, a.cid);
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    assert.ok(form.querySelector('[name="section_0"]').value);
    reads[0].resolve(
      Response.json({ steps: ["تجهيز الأدوات", "مراجعة الجاهزية"] }),
    );
    await wait(() => !pending);
    assert.equal(
      form.querySelector('[name="section_2"]').value,
      "تجهيز الأدوات\nمراجعة الجاهزية",
    );
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
    assert.deepEqual(
      writes,
      [],
      "generation must not persist any guide or task",
    );
    d.querySelector("[data-guide-generate]").click();
    await wait(() => reads.length === 2);
    form.querySelector('[name="section_2"]').value = "خطوة عدلها المستخدم";
    reads[1].resolve(Response.json({ steps: ["رد متأخر"] }));
    await wait(() => !pending);
    assert.equal(
      form.querySelector('[name="section_2"]').value,
      "خطوة عدلها المستخدم",
    );
    d.querySelector("[data-guide-generate]").click();
    await wait(() => reads.length === 3);
    reads[2].resolve(
      Response.json({ error: "تعذر الاتصال بسند" }, { status: 503 }),
    );
    await wait(() => !pending);
    assert.match(
      d.querySelector("[data-guide-state]").textContent,
      /تعذر الاتصال/,
    );
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
    assert.equal(
      form.querySelector('[name="section_2"]').value,
      "خطوة عدلها المستخدم",
    );
    d.querySelector("[data-guide-return]").click();
    await wait(() => !d.querySelector("#assistant").open && !pending);
    assert.ok(d.querySelector('[data-action="task-guide"]'));
    d.querySelector('[data-action="task-upload"]').click();
    await wait(() => d.querySelector('input[name="attachments"]'));
    assert.equal(
      d.querySelector('input[name="attachments"]').hasAttribute("accept"),
      false,
    );
    assert.match(d.querySelector("#modalBody").textContent, /1 غيغابايت/);
    d.querySelector('#modal [data-action="close-modal"]').click();
    d.querySelector(
      '[data-action="task-transition"][data-next="review"]',
    ).click();
    await wait(
      () =>
        d.querySelector("#modal").open &&
        d.querySelector('input[name="proofFiles"]') &&
        !pending,
    );
    let proof = d.querySelector('input[name="proofFiles"]');
    assert.equal(proof.required, true);
    assert.equal(proof.hasAttribute("accept"), false);
    assert.match(
      d.querySelector("#modalBody").textContent,
      /أرفق إثبات الإنجاز/,
    );
    proof.form.elements.namedItem("note").value = "اكتمل التجهيز";
    assert.equal(
      proof.form.checkValidity(),
      false,
      "empty proof must block submit despite a completion note",
    );
    d.querySelector('#modal [data-action="close-modal"]').click();
    await upload(a, "tasks", "proof", owner, {
      project: a.pid,
      committee: a.cid,
      entity: id,
    });
    d.querySelector(
      '[data-action="task-transition"][data-next="review"]',
    ).click();
    await wait(
      () =>
        d.querySelector("#modal").open &&
        d.querySelector('input[name="proofFiles"]') &&
        !pending,
    );
    proof = d.querySelector('input[name="proofFiles"]');
    assert.equal(
      proof.required,
      false,
      "an existing attached proof removes duplicate upload requirement",
    );
    assert.ok(d.querySelector('#modalBody a[href^="/api/files/"]'));
    proof.form.elements.namedItem("note").value = "اكتمل التجهيز";
    assert.equal(proof.form.checkValidity(), true);
    assert.deepEqual(errors, []);
  } finally {
    for (const read of reads) read.resolve(Response.json({ steps: ["خطوة"] }));
    dom.window.close();
    await a.DB.close();
  }
});
