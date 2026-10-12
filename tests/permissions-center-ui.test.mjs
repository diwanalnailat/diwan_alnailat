import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner } from "./support.mjs";

test("permissions center saves role and person rules, previews server access and retains stale drafts", async () => {
  const a = await fixture(),
    writes = [],
    errors = [];
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#permissions",
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
  let pending = 0;
  w.fetch = async (path, options = {}) => {
    pending++;
    try {
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
    for (const file of [
      "typography",
      "workspace",
      "workspace-views",
      "heritage-admin",
      "motion",
      "app",
    ])
      w.eval(fs.readFileSync(`public/${file}.js`, "utf8"));
    await wait(() => d.querySelector("#permissionsForm") && !pending);
    assert.ok(d.querySelector('#nav [data-page="permissions"]'));
    assert.equal(
      d.querySelector(".permission-table"),
      null,
      "center uses responsive cards",
    );
    change('[name="permission_target"]', "role:committee-member");
    change(
      '[data-permission-resource="expenses"][data-permission-action="submit"]',
      "deny",
    );
    change('[name="permission_preview_user"]', a.member.memberId);
    click('[data-action="permissions-preview"]');
    await wait(() => d.querySelector("#permissionsServerPreview h3"));
    assert.ok(writes.some((x) => x.path.endsWith("/permissions/preview")));
    submit();
    await wait(
      () =>
        d.querySelector("#permissionsForm")?.dataset.version === "1" &&
        !pending,
    );
    assert.equal(
      (await a.req("permissions")).data.roles.find(
        (x) => x.id === "role:committee-member",
      ).grants[0].effect,
      "deny",
    );
    click('[data-action="permissions-kind"][data-kind="user"]');
    change('[name="permission_target"]', a.member.memberId);
    const form = d.querySelector("#permissionsForm");
    change(
      '[data-permission-resource="tasks"][data-permission-action="comment"]',
      "deny",
    );
    await a.DB.prepare("UPDATE nl_members SET version=version+1 WHERE id=?")
      .bind(a.member.memberId)
      .run();
    submit();
    await wait(() => !form.querySelector(".form-error").hidden && !pending);
    assert.equal(
      form.querySelector('[data-permission-action="comment"]').value,
      "deny",
    );
    assert.equal(form.dataset.dirty, "true");
    click('[data-action="permissions-reload"]');
    await wait(() => d.querySelector("#permissionsForm") !== form && !pending);
    change(
      '[data-permission-resource="tasks"][data-permission-action="comment"]',
      "deny",
    );
    submit();
    await wait(
      () =>
        !pending &&
        d.querySelector("#permissionsForm")?.dataset.dirty !== "true",
    );
    assert.ok(
      (await a.req("permissions")).data.users
        .find((x) => x.id === a.member.memberId)
        .grants.some(
          (g) =>
            g.resource === "tasks" &&
            g.action === "comment" &&
            g.effect === "deny",
        ),
    );
    click('#nav [data-page="committees"]');
    await wait(() => d.querySelector('[data-action="committee-new"]'));
    click('[data-action="committee-new"]');
    await wait(() => d.querySelector("#modal").open);
    assert.equal(d.querySelector('[name="membership_permission"]'), null);
    click('[data-action="membership-add"]');
    assert.equal(d.querySelector('[name="membership_permission"]'), null);
    assert.deepEqual(errors, []);
  } finally {
    await new Promise((r) => setTimeout(r, 0));
    dom.window.close();
  }
});
