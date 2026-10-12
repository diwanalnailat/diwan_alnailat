import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner } from "./support.mjs";

test("committee draft reuses leadership people and retains explicit custom membership roles", async () => {
  const a = await fixture(),
    writes = [],
    errors = [],
    titles = new Set(["مسؤول التجهيز"]);
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#committees",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document;
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.addEventListener("error", (event) => errors.push(event.error));
  let pending = 0;
  w.fetch = async (path, opts = {}) => {
    pending++;
    try {
      if (opts.method === "POST") {
        const body = JSON.parse(opts.body);
        writes.push({ path, body });
        for (const member of body.members || [])
          if (member.title) titles.add(member.title);
        return Response.json({
          id: a.cid,
          people_invitation: "queued",
          inline_people_resolved: Object.fromEntries(
            (body.inline_people || []).map((p) => [
              p.token,
              w.crypto.randomUUID(),
            ]),
          ),
        });
      }
      if (new URL(path, w.location.origin).pathname === "/api/join-requests")
        return Response.json({
          is_admin: true,
          requests: [
            {
              id: "join-ui",
              committee_id: a.cid,
              committee_name: "لجنة الطلب",
              manager_id: a.manager.memberId,
              manager_name: "مدير الطلب الحالي",
              name: "طالب انضمام",
              phone: "+966500000075",
              status: "pending",
              reason: "المشاركة",
              created: "2026-10-13T00:00:00Z",
              can_forward: true,
              can_decide: false,
              version: 1,
            },
          ],
        });
      const response = await worker.fetch(
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
      if (String(path).startsWith("/api/state")) {
        return Response.json({
          ...(await response.json()),
          membershipTitles: [...titles],
        });
      }
      return response;
    } finally {
      pending--;
    }
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
  const wait = async (check) => {
    for (let i = 0; i < 200; i++) {
      if (check()) return;
      await tick();
    }
    throw Error("UI timeout: " + d.querySelector("#toast").textContent);
  };
  const click = (selector, root = d) => {
    const el = root.querySelector(selector);
    assert.ok(el, selector);
    el.click();
    return el;
  };
  const change = (el, value) => {
    el.value = value;
    el.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const openCommittee = async () => {
    const previousForm = d.querySelector("#modalBody form");
    click("[data-action=committee-new]");
    await wait(
      () =>
        d.querySelector("#modal").open &&
        d.querySelector("#modalBody form") !== previousForm &&
        d.querySelector("#modalBody [name=name]"),
    );
  };
  const stage = (field, name, phone) => {
    const picker = d.querySelector(`[data-person-picker=${field}]`);
    click("[data-action=inline-person-toggle]", picker);
    picker.querySelector("[data-person-name]").value = name;
    picker.querySelector("[data-person-phone]").value = phone;
    click("[data-action=inline-person-add]", picker);
    return picker.querySelector("select").value;
  };
  const addRow = () => {
    click("[data-action=membership-add]");
    return [...d.querySelectorAll("[data-membership]")].at(-1);
  };
  const submit = async () => {
    const form = d.querySelector("#modalBody form");
    form.dispatchEvent(
      new w.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: form.querySelector("[type=submit]"),
      }),
    );
    await wait(() => !d.querySelector("#modal").open && pending === 0);
    await tick();
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
    await openCommittee();
    d.querySelector("#modalBody [name=name]").value = "لجنة الأدوار";
    const first = addRow();
    const manager = stage("manager_id", "مدير وعضو", "0500000071");
    const approver = stage("second_approver_id", "معتمد وعضو", "0500000072");
    const delegate = stage("review_delegate_id", "بديل وعضو", "0500000073");
    for (const token of [manager, approver, delegate])
      assert.ok(
        [...first.querySelector("[name=membership_id]").options].some(
          (o) => o.value === token,
        ),
        "existing rows receive pending people",
      );
    change(first.querySelector("[name=membership_id]"), manager);
    change(first.querySelector("[name=membership_role]"), "other");
    const titleInput = first.querySelector("[name=membership_title]");
    assert.equal(titleInput.required, true);
    assert.equal(titleInput.disabled, false);
    assert.equal(titleInput.checkValidity(), false);
    titleInput.value = "منسق الضيافة";
    change(first.querySelector("[name=membership_role]"), "supervisor");
    change(first.querySelector("[name=membership_role]"), "other");
    assert.equal(
      titleInput.value,
      "منسق الضيافة",
      "role switching retains the custom draft",
    );
    assert.equal(
      d.querySelector("[name=manager_id]").value,
      manager,
      "membership choice does not remove leadership",
    );
    const second = addRow();
    change(second.querySelector("[name=membership_id]"), approver);
    change(
      second.querySelector("[name=membership_role]"),
      "title:مسؤول التجهيز",
    );
    const third = addRow();
    change(third.querySelector("[name=membership_id]"), delegate);
    change(d.querySelector("[name=manager_id]"), manager);
    assert.equal(second.querySelector("[name=membership_id]").value, approver);
    assert.equal(third.querySelector("[name=membership_id]").value, delegate);
    assert.equal(
      writes.length,
      0,
      "draft roles and people do not persist or notify",
    );
    assert.equal(
      d.querySelector("[name=membership_role] option[value=supervisor]")
        .textContent,
      "مشرف لجنة",
    );
    await submit();
    const body = writes[0].body;
    assert.equal(body.members.length, 3);
    assert.equal(body.manager_id, manager);
    assert.equal(body.members.find((m) => m.id === manager).role, "member");
    assert.equal(
      body.members.find((m) => m.id === manager).title,
      "منسق الضيافة",
    );
    assert.equal(
      body.members.find((m) => m.id === approver).title,
      "مسؤول التجهيز",
    );
    assert.equal(body.inline_people.length, 3);
    await openCommittee();
    const later = addRow();
    assert.ok(
      [...later.querySelector("[name=membership_role]").options].some(
        (o) => o.value === "title:منسق الضيافة",
      ),
      "saved title registry is available in a later form",
    );
    click("[data-action=membership-remove]", later);
    d.querySelector("#modalBody [name=name]").value = "لجنة دون عضوية صريحة";
    stage("manager_id", "مدير فقط", "0500000074");
    await submit();
    assert.deepEqual(
      writes[1].body.members,
      [],
      "automatic leadership membership is left to server reconciliation",
    );
    click("[data-page=join_requests]");
    await wait(() => d.querySelector("[data-action=join-request-open]"));
    click("[data-action=join-request-open]");
    await wait(() =>
      d.querySelector("#modalBody [data-action=join-request-forward]"),
    );
    click("#modalBody [data-action=join-request-forward]");
    await wait(() => d.querySelector("#modalBody [name=manager_display]"));
    assert.equal(
      d.querySelector("#modalBody [name=manager_display]").value,
      "مدير الطلب الحالي",
      "fresh referral manager overrides stale workspace display",
    );
    assert.equal(
      d.querySelector("#modalBody [name=manager_display]").disabled,
      true,
    );
    assert.equal(d.querySelector("#modalBody [name=supervisor_id]"), null);
    await submit();
    assert.equal(writes[2].path, "/api/join-requests/forward");
    assert.deepEqual(writes[2].body, { id: "join-ui", version: 1 });
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
