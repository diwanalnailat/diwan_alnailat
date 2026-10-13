import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { app, addProject, addMember } from "./support.mjs";

test("screen reads are scoped, detail reads are explicit, and search preserves authorization", async () => {
  const a = await app();
  const p = await addProject(a);
  const other = await addProject(a, "Other season");
  const reader = await addMember(a, "Reader", [
    { resource: "tasks", action: "view", scope: "assigned", effect: "allow" },
  ]);
  const stamp = new Date().toISOString();
  for (const [id, project] of [
    ["visible-task", p],
    ["other-task", other],
  ])
    await a.DB.prepare(
      "INSERT INTO nl_tasks(id,project_id,title,created_by,created,updated) VALUES(?,?,?,?,?,?)",
    )
      .bind(
        id,
        typeof project === "string" ? project : project.id,
        "أعمال البحث",
        "owner",
        stamp,
        stamp,
      )
      .run();
  const queries = [];
  const prepare = a.DB.prepare.bind(a.DB);
  a.DB.prepare = (sql) => {
    queries.push(sql);
    return prepare(sql);
  };
  const services = await a.req("state?view=services");
  assert.equal(services.status, 200);
  assert.equal(services.data.tasks.length, 0);
  assert.ok(
    !queries.some((sql) =>
      /FROM nl_(tasks|expenses|assets|files|audit|notifications|join_requests)\b/.test(
        sql,
      ),
    ),
  );
  queries.length = 0;
  const tasks = await a.req("state?view=tasks&project=" + (p.id || p));
  assert.equal(tasks.status, 200);
  assert.deepEqual(
    tasks.data.tasks.map((t) => t.id),
    ["visible-task"],
  );
  assert.ok(
    !queries.some((sql) =>
      /FROM nl_(expenses|assets|files|audit|notifications|join_requests)\b/.test(
        sql,
      ),
    ),
  );
  const detail = await a.req("state?view=tasks&include=expense_detail");
  assert.equal(detail.status, 200);
  assert.ok(detail.data.loaded_views.includes("expense_detail"));
  assert.equal((await a.req("state?view=unknown")).status, 400);
  assert.equal(
    (await a.req("state?view=tasks", undefined, reader)).data.tasks.length,
    0,
  );
  const search = await a.req("search?q=" + encodeURIComponent("اعمال"));
  assert.equal(search.status, 200);
  assert.equal(
    search.data.results.filter((r) => r.resource === "tasks").length,
    2,
  );
  const denied = await a.req(
    "search?q=" + encodeURIComponent("اعمال"),
    undefined,
    reader,
  );
  assert.equal(denied.data.results.length, 0);
  assert.equal((await a.req("search?q=%25")).data.results.length, 0);
  queries.length = 0;
  await a.req("state?view=tasks&include=task_detail&project=" + (p.id || p));
  assert.ok(
    queries.some((sql) =>
      /FROM nl_files WHERE entity_type=\? AND entity_id IN/.test(sql),
    ),
  );
  queries.length = 0;
  await a.req("state?view=tasks&include=task_detail", undefined, reader);
  assert.ok(!queries.some((sql) => /FROM nl_files\b/.test(sql)));
});

test("workspace boots only the requested screen and does not poll or prefetch other screens", async () => {
  const a = await app();
  await a.req("state?view=services");
  await a.DB.prepare(
    "INSERT INTO nl_suppliers(id,name,created_by,created) VALUES(?,?,?,?)",
  )
    .bind("search-supplier", "مورد البحث", "owner", new Date().toISOString())
    .run();
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/workspace#join_requests",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const calls = [],
    timers = [];
  dom.window.scrollTo = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.setInterval = (fn, ms) => {
    timers.push(ms);
    return 1;
  };
  dom.window.fetch = async (url, options = {}) => {
    calls.push(String(url));
    const result = await a.req(
      String(url).replace(/^\/api\//, ""),
      options.body ? JSON.parse(options.body) : undefined,
    );
    return {
      ok: result.status < 400,
      status: result.status,
      json: async () => result.data,
    };
  };
  try {
    dom.window.eval(fs.readFileSync("public/workspace.js", "utf8"));
    dom.window.eval(fs.readFileSync("public/workspace-views.js", "utf8"));
    dom.window.eval(fs.readFileSync("public/app.js", "utf8"));
    for (
      let i = 0;
      i < 40 && !dom.window.document.querySelector('[data-page="services"]');
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(calls[0].includes("view=join_requests"));
    assert.ok(!timers.includes(15000));
    dom.window.document.querySelector('[data-page="services"]').click();
    for (
      let i = 0;
      i < 40 && !dom.window.document.querySelector(".service-directory");
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(dom.window.document.querySelector(".service-directory"));
    assert.equal(
      calls.filter((url) => url.includes("view=services")).length,
      1,
    );
    assert.ok(
      !calls.some(
        (url) => url.includes("view=expenses") || url.includes("/search"),
      ),
    );
    const d = dom.window.document;
    d.querySelector('[data-action="search"]').click();
    const input = d.querySelector("#globalSearch");
    input.value = "مورد";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    for (let i = 0; i < 100 && !d.querySelector(".search-result"); i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(calls.filter((url) => url.includes("/search?")).length, 1);
    d.querySelector('.search-result[data-action="supplier-view"]').click();
    for (
      let i = 0;
      i < 100 && !d.querySelector("#modalBody .summary-banner");
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(
      d
        .querySelector("#modalBody .summary-banner")
        ?.textContent.includes("مورد البحث"),
    );
    assert.equal(
      calls.filter((url) => url.includes("include=supplier_detail")).length,
      1,
    );
  } finally {
    dom.window.close();
  }
});
