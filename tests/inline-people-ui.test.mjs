import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner } from "./support.mjs";

test("inline people stay in the enclosing draft and only referenced definitions are submitted", async () => {
  const a = await fixture();
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#committees",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document,
    writes = [],
    errors = [];
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.addEventListener("error", (event) => errors.push(event.error));
  w.fetch = async (path, opts = {}) => {
    if (opts.method === "POST") {
      writes.push({ path, body: JSON.parse(opts.body) });
      const resolved = Object.fromEntries(
        (writes.at(-1).body.inline_people || []).map((p) => [
          p.token,
          w.crypto.randomUUID(),
        ]),
      );
      return Response.json({
        id: a.cid,
        inline_people_resolved: resolved,
        people_invitation: "queued",
      });
    }
    return worker.fetch(
      new Request(new URL(path, w.location.origin), {
        ...opts,
        headers: {
          ...opts.headers,
          origin: w.location.origin,
          "oai-authenticated-user-id": owner.id,
          "oai-authenticated-user-email": owner.email,
        },
      }),
      a.env,
    );
  };
  const wait = async (check) => {
    for (let i = 0; i < 200; i++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error("UI timeout: " + d.querySelector("#toast").textContent);
  };
  const click = (selector, root = d) => {
    const element = root.querySelector(selector);
    assert.ok(element, selector);
    element.click();
    return element;
  };
  const stage = (name, label, phone) => {
    const picker = d.querySelector(`[data-person-picker=${name}]`);
    click("[data-action=inline-person-toggle]", picker);
    picker.querySelector("[data-person-name]").value = label;
    picker.querySelector("[data-person-phone]").value = phone;
    assert.equal(picker.querySelector("[data-person-email]").required, false);
    click("[data-action=inline-person-add]", picker);
    return picker.querySelector("select").value;
  };
  try {
    for (const file of [
      "vendor/qrcode",
      "asset-labels",
      "typography",
      "workspace",
      "workspace-views",
      "heritage-admin",
      "motion",
      "app",
    ])
      w.eval(fs.readFileSync(`public/${file}.js`, "utf8"));
    await wait(() => d.querySelector("[data-action=committee-new]"));
    click("[data-action=committee-new]");
    await wait(() => d.querySelector("#modalBody [name=name]"));
    d.querySelector("#modalBody [name=name]").value = "لجنة الاختبار";
    assert.equal(d.activeElement.id, "modalTitle");
    const manager = stage("manager_id", "مدير الاختبار", "0500000061");
    const approver = stage(
      "second_approver_id",
      "معتمد الاختبار",
      "0500000062",
    );
    assert.match(manager, /^new-person:/);
    assert.match(approver, /^new-person:/);
    assert.equal(
      writes.length,
      0,
      "adding a person must not save or notify before parent save",
    );
    assert.equal(
      d.querySelector("#modalBody [name=name]").value,
      "لجنة الاختبار",
    );
    // Changing another reviewer rebuilds the select without dropping staged identities.
    d.querySelector("[name=manager_id]").dispatchEvent(
      new w.Event("change", { bubbles: true }),
    );
    assert.equal(d.querySelector("[name=second_approver_id]").value, approver);
    click("[data-action=membership-add]");
    const discarded = stage("membership_id", "عضو ملغى", "0500000063");
    click("[data-action=membership-remove]");
    const form = d.querySelector("#modalBody form");
    form.dispatchEvent(
      new w.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: form.querySelector("[type=submit]"),
      }),
    );
    await wait(() => writes.length === 1 && !d.querySelector("#modal").open);
    assert.equal(writes[0].path, "/api/committees/save");
    assert.deepEqual(
      writes[0].body.inline_people.map((p) => p.token).sort(),
      [manager, approver].sort(),
    );
    assert.equal(
      writes[0].body.inline_people.some((p) => p.token === discarded),
      false,
    );
    assert.equal(
      writes[0].body.inline_people.every((p) => !Object.hasOwn(p, "email")),
      true,
    );
    assert.equal(writes[0].body.manager_id, manager);
    assert.equal(writes[0].body.second_approver_id, approver);
    click("[data-page=tasks]");
    await wait(() => d.querySelector("[data-action=task-new]"));
    assert.equal(
      d.querySelector("[data-filter=assignee]").closest("[data-person-picker]"),
      null,
    );
    click("[data-action=task-new]");
    await wait(() => d.querySelector("[data-person-picker=collaborators]"));
    const taskAssignee = stage("assignee_id", "منفذ المهمة", "0500000064");
    const collaboratorPicker = d.querySelector(
      "[data-person-picker=collaborators]",
    );
    click("[data-action=inline-person-toggle]", collaboratorPicker);
    collaboratorPicker.querySelector("[data-person-name]").value =
      "مشارك المهمة";
    collaboratorPicker.querySelector("[data-person-phone]").value =
      "0500000065";
    click("[data-action=inline-person-add]", collaboratorPicker);
    const collaboratorToken = collaboratorPicker.querySelector(
      "input[type=checkbox]:checked",
    ).value;
    click("[data-action=inline-person-toggle]", collaboratorPicker);
    collaboratorPicker.querySelector("[data-person-name]").value =
      "مسودة إضافية";
    d.querySelector("#modalBody [name=committee_id]").dispatchEvent(
      new w.Event("change", { bubbles: true }),
    );
    assert.equal(
      d.querySelector("#modalBody [name=assignee_id]").value,
      taskAssignee,
    );
    assert.equal(
      collaboratorPicker.querySelector("input[type=checkbox]:checked").value,
      collaboratorToken,
    );
    assert.equal(
      collaboratorPicker.querySelector("[data-person-name]").value,
      "مسودة إضافية",
    );
    assert.equal(
      writes.length,
      1,
      "task draft additions must still make no server writes",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
