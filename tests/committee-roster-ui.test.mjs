import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner } from "./support.mjs";

test("committee roster loads only on dialog open or explicit refresh and preserves delivery, login and retry states", async () => {
  const a = await fixture(),
    writes = [],
    errors = [];
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#committees",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document;
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.addEventListener("error", (e) => errors.push(e.error));
  let pending = 0,
    failRoster = false,
    rosterReads = 0;
  w.fetch = async (path, options = {}) => {
    pending++;
    try {
      if (String(path).includes("committees/roster")) {
        rosterReads++;
        if (failRoster)
          return Response.json(
            { error: "roster unavailable" },
            { status: 503 },
          );
      }
      if (options.method === "POST")
        writes.push({ path: String(path), body: JSON.parse(options.body) });
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
  const wait = async (fn) => {
    for (let i = 0; i < 250; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error("UI timeout: " + d.querySelector("#toast")?.textContent);
  };
  const click = (selector) => {
    const el = d.querySelector(selector);
    assert.ok(el, selector);
    el.click();
  };
  try {
    for (const [id, title, status] of [
      ["ui-manager", "Manager assignment", "delivered"],
      ["ui-member", "Member assignment <script>bad()</script>", "queued"],
    ])
      await a.DB.prepare(
        "INSERT INTO nl_notifications VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          a.manager.memberId,
          title,
          "",
          "committees",
          a.cid,
          a.pid,
          "whatsapp",
          status,
          "2026-10-12T22:00:00.000Z",
        )
        .run();
    await a.DB.prepare(
      "INSERT INTO nl_audit(id,actor,action,resource,entity_id,detail,created) VALUES(?,?,'login','users',?,?,?)",
    )
      .bind(
        "ui-login",
        a.manager.memberId,
        a.manager.memberId,
        "",
        "2026-10-11T22:00:00.000Z",
      )
      .run();
    for (const file of [
      "typography",
      "workspace",
      "workspace-views",
      "heritage-admin",
      "motion",
      "app",
    ])
      w.eval(fs.readFileSync(`public/${file}.js`, "utf8"));
    await wait(
      () => d.querySelector('[data-action="committee-open"]') && !pending,
    );
    click('[data-action="committee-open"]');
    await wait(
      () =>
        d.querySelector('[data-action="committee-roster-open"]') && !pending,
    );
    assert.equal(
      rosterReads,
      0,
      "opening the committee never fetches roster data",
    );
    assert.equal(d.querySelector("#committeeRoster"), null);
    click('[data-action="task-view"][data-view="table"]');
    await wait(() => d.querySelector('[data-view="table"].active') && !pending);
    assert.equal(
      rosterReads,
      0,
      "changing task views never fetches roster data",
    );
    click('[data-action="task-view"][data-view="kanban"]');
    click('[data-action="committee-roster-open"]');
    await wait(() => d.querySelector(".committee-roster-person") && !pending);
    assert.equal(rosterReads, 1);
    assert.ok(d.querySelector("#modal").open);
    assert.ok(d.querySelector("#modalBody #committeeRoster"));
    assert.equal(d.querySelector("#main #committeeRoster"), null);
    assert.equal(d.querySelectorAll(".committee-roster-person").length, 3);
    const roster = d.querySelector("#committeeRoster");
    assert.ok(roster.textContent.includes("وصلت"));
    assert.ok(roster.textContent.includes("بانتظار الإرسال"));
    assert.ok(roster.textContent.includes("لم يدخل بعد آخر دعوة"));
    assert.ok(roster.textContent.includes("لا يوجد دخول مسجل"));
    assert.equal(roster.querySelector("script"), null);
    assert.ok(
      d.querySelector("#committeeRoster").textContent.includes("manager"),
    );
    assert.equal(d.querySelector('#committeeRoster [role="alert"]'), null);
    failRoster = true;
    click('[data-action="committee-roster-refresh"]');
    await wait(
      () => d.querySelector('#committeeRoster [role="alert"]') && !pending,
    );
    assert.match(
      d.querySelector("#committeeRoster").textContent,
      /roster unavailable/,
    );
    assert.ok(
      d.querySelector(".kanban"),
      "task content survives roster failure",
    );
    failRoster = false;
    click('#committeeRoster [data-action="committee-roster-refresh"]');
    await wait(() => d.querySelector(".committee-roster-person") && !pending);
    assert.equal(rosterReads, 3);
    click('[data-action="close-modal"]');
    assert.equal(d.querySelector("#modal").open, false);
    click('[data-action="task-view"][data-view="table"]');
    await wait(() => d.querySelector('[data-view="table"].active') && !pending);
    assert.equal(
      rosterReads,
      3,
      "rendering after close never reloads the hidden roster",
    );
    click('[data-action="committee-roster-open"]');
    await wait(() => d.querySelector(".committee-roster-person") && !pending);
    assert.equal(rosterReads, 4, "reopening fetches fresh data");
    assert.equal(writes.length, 0, "refresh never sends an invitation");
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
    a.DB.close();
  }
});
