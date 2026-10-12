import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner } from "./support.mjs";

test("committee roster precedes tasks and supports independent delivery, login and retry states", async () => {
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
  const change = (selector, value) => {
    const el = d.querySelector(selector);
    assert.ok(el, selector);
    el.value = value;
    el.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const submit = () =>
    d
      .querySelector("#permissionsForm")
      .dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
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
    await wait(() => d.querySelector(".committee-roster-person") && !pending);
    assert.equal(d.querySelectorAll(".committee-roster-person").length, 3);
    const roster = d.querySelector("#committeeRoster");
    assert.ok(roster.textContent.includes("وصلت"));
    assert.ok(roster.textContent.includes("بانتظار الإرسال"));
    assert.ok(roster.textContent.includes("لم يدخل بعد آخر دعوة"));
    assert.ok(roster.textContent.includes("لا يوجد دخول مسجل"));
    assert.equal(roster.querySelector("script"), null);
    assert.ok(
      d
        .querySelector("#committeeRoster")
        .compareDocumentPosition(d.querySelector(".kanban")) &
        w.Node.DOCUMENT_POSITION_FOLLOWING,
    );
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
    assert.ok(rosterReads >= 3);
    assert.equal(writes.length, 0, "refresh never sends an invitation");
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
    a.DB.close();
  }
});
