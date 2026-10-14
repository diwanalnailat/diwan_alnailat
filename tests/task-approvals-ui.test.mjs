import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { completionApprovalStatement } from "../lib/task-approvals.js";
import { fixture, owner, saveTask } from "./support.mjs";

test("administrative approvals load on entry, show completion evidence and save a separate audited decision", async () => {
  const a = await fixture();
  const reviewId = await saveTask(a, { title: "Pending <script>bad()</script>" });
  await a.DB.prepare("UPDATE nl_tasks SET status='review' WHERE id=?")
    .bind(reviewId)
    .run();
  const id = await saveTask(a, { title: "Review <script>bad()</script>" });
  await a.DB.prepare("UPDATE nl_tasks SET status='done' WHERE id=?")
    .bind(id)
    .run();
  const task = await a.DB.prepare("SELECT * FROM nl_tasks WHERE id=?")
    .bind(id)
    .first();
  await completionApprovalStatement(
    a.DB,
    task,
    { id: a.cid },
    { id: a.manager.memberId, name: "manager" },
    "Completed safely",
    new Date().toISOString(),
  ).run();
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#tasks",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document,
    errors = [];
  let pending = 0,
    reads = 0,
    fail = false,
    writes = 0;
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.addEventListener("error", (e) => errors.push(e.error));
  w.fetch = async (path, options = {}) => {
    pending++;
    try {
      if (String(path).includes("task-approvals?")) {
        reads++;
        if (fail)
          return Response.json({ error: "temporary error" }, { status: 503 });
      }
      if (String(path).endsWith("task-approvals/decide")) writes++;
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
    for (let i = 0; i < 300; i++) {
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error(
      "UI timeout: " +
        d.querySelector("#toast")?.textContent +
        " | " +
        d.querySelector("#main")?.textContent +
        " | " +
        errors.map(String),
    );
  };
  const click = (selector) => {
    const el = d.querySelector(selector);
    assert.ok(el, selector);
    el.click();
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
      () => d.querySelector('[data-page="task_approvals"]') && !pending,
    );
    assert.equal(reads, 0, "no approvals fetch on task view");
    click('[data-page="task_approvals"]');
    await wait(() => d.querySelector(".approval-card") && !pending);
    assert.equal(reads, 1);
    assert.equal(d.querySelector(".approval-card script"), null);
    const reviewCard = d.querySelector(`.approval-card [data-action="task"][data-id="${reviewId}"]`)?.closest(".approval-card");
    assert.ok(reviewCard, "submitted task is visible before completion approval exists");
    assert.match(reviewCard.textContent, /بانتظار اعتماد مراجع الإنجاز/);
    assert.match(reviewCard.textContent, /manager/);
    assert.doesNotMatch(reviewCard.textContent, /اعتمد الإنجاز:/);
    assert.equal(reviewCard.querySelector('[data-action="approval-open"]'), null);
    click(`.approval-card [data-action="task"][data-id="${reviewId}"]`);
    await wait(() => d.querySelector("#detail").open && !pending);
    assert.match(d.querySelector("#detailBody").textContent, /Pending/);
    assert.equal(d.querySelector('#detailBody [data-next="done"]'), null, "administrator does not impersonate designated reviewer");
    d.querySelector("#detail").close();
    // A stale/previously rendered administrative link must also open the current task.
    const staleLink = d.createElement("button");
    staleLink.dataset.action = "approval-open";
    staleLink.dataset.id = reviewId;
    d.querySelector("#taskApprovals").append(staleLink);
    staleLink.click();
    await wait(() => d.querySelector("#detail").open && !pending);
    assert.equal(d.querySelector("#modal").open, false);
    assert.match(d.querySelector("#detailBody").textContent, /Pending/);
    assert.equal(d.querySelector('#detailBody [data-next="done"]'), null);
    d.querySelector("#detail").close();
    staleLink.remove();
    const statusFilter = d.querySelector('[name="approval_status"]');
    statusFilter.value = "awaiting_review";
    statusFilter.dispatchEvent(new w.Event("change", { bubbles: true }));
    await wait(() => !pending && d.querySelectorAll(".approval-card").length === 1);
    assert.ok(d.querySelector(`.approval-card [data-id="${reviewId}"]`));
    statusFilter.value = "";
    statusFilter.dispatchEvent(new w.Event("change", { bubbles: true }));
    await wait(() => !pending && d.querySelectorAll(".approval-card").length === 2);
    click('[data-action="approval-open"]');
    await wait(() => d.querySelector(".approval-detail") && !pending);
    assert.match(
      d.querySelector(".approval-detail").textContent,
      /Completed safely/,
    );
    assert.equal(
      d.querySelector('[name="action"] option[value="resume_payment"]'),
      null,
    );
    d.querySelector('[name="action"]').value = "hold";
    d.querySelector('[name="note"]').value = "Need finance confirmation";
    d.querySelector(".approval-detail").requestSubmit();
    await wait(
      () => writes === 1 && d.querySelector(".approval-history") && !pending,
    );
    const approval = await a.DB.prepare(
      "SELECT * FROM nl_task_approvals WHERE task_id=?",
    )
      .bind(id)
      .first();
    assert.equal(approval.status, "on_hold");
    assert.equal(
      (
        await a.DB.prepare("SELECT status FROM nl_tasks WHERE id=?")
          .bind(id)
          .first()
      ).status,
      "done",
    );
    assert.match(
      d.querySelector(".approval-history").textContent,
      /Need finance confirmation/,
    );
    click('[data-action="close-modal"]');
    fail = true;
    click('[data-action="approval-refresh"]');
    await wait(
      () => d.querySelector('#taskApprovals [role="alert"]') && !pending,
    );
    fail = false;
    click('#taskApprovals [data-action="approval-refresh"]');
    await wait(() => d.querySelector(".approval-card") && !pending);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
    await a.DB.close();
  }
});
