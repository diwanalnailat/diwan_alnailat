import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, state, owner, review } from "./support.mjs";
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
test("actual interface and server: heritage entry, connected membership, task stages, classified files and expense form", async () => {
  const a = await fixture(),
    errors = [],
    dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
      url: "https://diwan.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    }),
    w = dom.window,
    d = w.document;
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  w.fetch = async (path, opts = {}) => {
    const headers = {
      ...opts.headers,
      origin: "https://diwan.test",
      "oai-authenticated-user-id": owner.id,
      "oai-authenticated-user-email": owner.email,
    };
    let body = opts.body;
    if (body instanceof w.FormData) {
      const fd = new FormData();
      for (const [k, v] of body.entries()) {
        if (v instanceof w.File) {
          if (!v.size) continue;
          const bytes = await new Promise((resolve, reject) => {
            const r = new w.FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsArrayBuffer(v);
          });
          fd.append(k, new File([bytes], v.name, { type: v.type }));
        } else fd.append(k, v);
      }
      body = fd;
    }
    return worker.fetch(
      new Request(new URL(path, w.location.origin), { ...opts, headers, body }),
      a.env,
    );
  };
  w.addEventListener("error", (e) => errors.push(e.error));
  w.eval(fs.readFileSync("public/vendor/qrcode.js", "utf8"));
  w.eval(fs.readFileSync("public/asset-labels.js", "utf8"));
  for (const file of [
    "typography",
    "workspace",
    "workspace-views",
    "motion",
    "app",
  ])
    w.eval(fs.readFileSync(`public/${file}.js`, "utf8"));
  const wait = async (fn) => {
    for (let i = 0; i < 200; i++) {
      if (await fn()) return;
      await tick(10);
    }
    throw Error(
      "Timeout: " +
        d.querySelector("#toast").textContent +
        " / " +
        d.querySelector(".form-error:not([hidden])")?.textContent,
    );
  };
  const click = (sel) => {
      const e = d.querySelector(sel);
      assert.ok(e, "Missing " + sel);
      e.click();
      return e;
    },
    val = (name, value, scope = "#modalBody") => {
      const e = d.querySelector(scope + ' [name="' + name + '"]');
      assert.ok(e, "Missing " + name);
      e.value = value;
      return e;
    };
  const submit = async () => {
    const f = d.querySelector("#modalBody form");
    f.dispatchEvent(
      new w.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: f.querySelector('[type=submit]:not([value="print"])'),
      }),
    );
    await wait(() => !d.querySelector("#modal").open);
  };
  try {
    await wait(() => d.querySelector(".nailat-hero"));
    assert.ok(d.body.classList.contains("landing-mode"));
    assert.ok(
      d
        .querySelector(".nw-honor-photo img")
        .src.endsWith("/brand/honoring.jpg"),
    );
    assert.equal(d.querySelectorAll(".nw-season").length, 5);
    assert.equal(d.querySelectorAll(".nw-season:not([hidden])").length, 1);
    click('[data-nailat-edition="7"]');
    assert.equal(
      d.querySelector(".nw-season:not([hidden])").id,
      "nailat-season-7",
    );
    assert.match(
      d.querySelector("#nailat-season-7").textContent,
      /بيرق المؤسس/,
    );
    assert.match(
      d.querySelector("#nailat-season-7").textContent,
      /نخبة النخبة/,
    );
    d.querySelector('[data-nailat-edition="7"]').dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    assert.equal(
      d.querySelector('[role="tab"][aria-selected="true"]').dataset
        .nailatEdition,
      "10",
    );
    assert.equal(d.querySelectorAll(".nw-season:not([hidden])").length, 1);
    assert.equal(
      d.querySelector(".nailat-world").textContent.includes("المراح"),
      false,
    );
    assert.equal(
      d.querySelectorAll(".modal-sanad,.sanad-fab,.side-assistant").length,
      0,
    );
    click(".heritage-nav [data-page=overview]");
    await wait(() => !d.body.classList.contains("landing-mode"));
    assert.ok(d.querySelector(".command-hero"));
    w.innerWidth = 390;
    w.dispatchEvent(new w.Event("resize"));
    assert.equal(d.querySelector("#sidebar").inert, true);
    click(".mobile-menu");
    assert.equal(d.querySelector("#sidebar").inert, false);
    assert.equal(
      d.querySelector(".mobile-menu").getAttribute("aria-expanded"),
      "true",
    );
    click(".menu-backdrop");
    assert.equal(d.querySelector("#sidebar").inert, true);
    w.innerWidth = 1280;
    w.dispatchEvent(new w.Event("resize"));
    assert.equal(d.querySelectorAll(".metric-card").length, 4);
    assert.doesNotMatch(
      d.querySelector(".command-hero h1").textContent,
      /[،.]/,
    );
    click("[data-page=services]");
    assert.equal(d.querySelectorAll(".service-group").length, 4);
    click("[data-action=service-filter][data-filter-value=field]");
    assert.equal(d.querySelectorAll(".service-group").length, 1);
    click("[data-page=calendar]");
    click("[data-action=schedule-filter][data-filter-value=all]");
    assert.equal(
      d.querySelector("[data-filter-value=all]").getAttribute("aria-pressed"),
      "true",
    );
    click("[data-page=decisions]");
    assert.ok(d.querySelector(".filter-chips"));
    click("[data-page=field]");
    assert.ok(d.querySelector("#projectFilter"));
    click("[data-page=reports]");
    assert.ok(d.querySelector("[data-action=workspace-export]"));
    click("[data-page=profile]");
    assert.match(d.querySelector("#main").textContent, /مستحقاتي الشخصية/);
    click("[data-page=projects]");
    click("[data-action=project-edit]");
    assert.equal(d.querySelector('[name="supervisor_id"]'), null);
    await submit();
    click("[data-page=assets]");
    click("[data-action=asset-new]");
    val("name", "كرفان ميداني");
    val("kind", "serialized").dispatchEvent(
      new w.Event("change", { bubbles: true }),
    );
    assert.equal(d.querySelector("[name=serial]").readOnly, true);
    assert.ok(d.querySelector("[name=category]").textContent.includes("أوشحة"));
    val("manufacturer_serial", "M-99");
    val("geo_label", "البوابة الشمالية");
    val("geo_lat", "24.7");
    val("geo_lng", "46.6");
    await submit();
    const savedAsset = (await state(a)).assets.find(
      (x) => x.name === "كرفان ميداني",
    );
    assert.match(savedAsset.serial, /^NL-\d{8}$/);
    assert.equal(savedAsset.meta.site_location.lat, 24.7);
    click("[data-action=asset-lookup]");
    val("lookup_code", savedAsset.serial);
    click("#modalBody [type=submit]");
    assert.match(d.querySelector("#modalBody").textContent, /كرفان ميداني/);
    assert.ok(
      d.querySelector('#modalBody a[href^="https://www.google.com/maps/dir/"]'),
    );
    click("[data-action=asset-label]");
    assert.ok(d.querySelector("[data-label-preview] svg"));
    assert.ok(
      d
        .querySelector("[data-label-preview]")
        .textContent.includes(savedAsset.serial),
    );
    assert.ok(d.querySelector("[data-label-pdf]"));
    click("[data-action=close-modal]");
    click("[data-page=committees]");
    click("[data-action=committee-edit]");
    assert.equal(val("second_approver_id", "owner").tagName, "SELECT");
    assert.equal(d.querySelectorAll("[data-budget-line]").length, 1);
    await submit();
    assert.equal(
      (await state(a)).committees[0].config.budgetLines[0].budget,
      1000000,
    );
    click("[data-page=users]");
    click("[data-action=user-new]");
    val("name", "عضو من الواجهة");
    val("status", "active");
    val("phone", "+966500123456");
    click("[data-action=member-next]");
    await wait(() => d.querySelector("#memberForm").dataset.step === "1");
    click("[data-action=member-link-add]");
    val("link_committee", a.cid);
    val("link_role", "member");
    click("[data-action=member-next]");
    await wait(() => d.querySelector("#memberForm").dataset.step === "2");
    assert.ok(d.querySelector("#memberReview").textContent.includes("سجلاته"));
    await submit();
    const member = (await state(a)).members.find(
      (m) => m.name === "عضو من الواجهة",
    );
    assert.ok(
      (await state(a)).committees[0].members.some((m) => m.id === member.id),
    );
    click("[data-page=tasks]");
    click("[data-action=task-new]");
    val("title", "تنظيم استقبال الضيوف");
    val("description", "تجهيز الاستقبال حسب العدد والمكان المحددين");
    val("outcome", "جاهزية نقطة الاستقبال");
    val("assignee_id", a.member.memberId);
    val("due", "2027-01-20");
    assert.equal(d.querySelectorAll("[name=reviewer_id]").length, 0);
    assert.ok(d.querySelector("[name=voiceFiles]"));
    assert.ok(d.querySelector("[name=guideFiles]"));
    await submit();
    await wait(() => d.querySelector("#detail").open);
    assert.ok(d.querySelector(".task-conversation"));
    click("[data-action=task-transition][data-next=doing]");
    await submit();
    const task = (await state(a)).tasks.find(
      (t) => t.title === "تنظيم استقبال الضيوف",
    );
    assert.equal(task.status, "doing");
    click("[data-page=expenses]");
    click("[data-action=expense-new]");
    assert.equal(d.querySelector("[name=budget_line_id]").tagName, "SELECT");
    assert.equal(d.querySelectorAll("[name=reviewer]").length, 0);
    assert.ok(d.querySelector("[name=invoiceFiles]"));
    assert.ok(d.querySelector("[name=cameraInvoice]"));
    assert.ok(
      d
        .querySelector("[data-approval-preview]")
        .textContent.includes("الاعتماد الثاني"),
    );
    assert.ok(
      d
        .querySelector("[data-approval-preview]")
        .textContent.includes("البديل الإداري"),
    );
    assert.ok(
      d
        .querySelector("[data-approval-preview]")
        .textContent.includes("يلزم تعيين معتمد من إعدادات اللجنة"),
    );
    val("title", "مصروف الضيافة");
    val("amount", "120");
    val("tax", "0");
    val("budget_line_id", "hospitality");
    val("date", "2027-01-10");
    // jsdom does not populate FormData from a programmatically assigned FileList; inject the file into the form serialization.
    const Native = w.FormData;
    const invoice = new w.File(["%PDF-1.7\nproof"], "invoice.pdf", {
      type: "application/pdf",
    });
    w.FormData = class extends Native {
      constructor(form) {
        super(form);
        if (form?.classList.contains("expense-editor"))
          this.set("invoiceFiles", invoice);
      }
    };
    await submit();
    const expense = (await state(a)).expenses.find(
      (e) => e.title === "مصروف الضيافة",
    );
    assert.ok(expense);
    assert.equal(expense.meta.budget_line_id, "hospitality");
    assert.equal(expense.meta.funding_source, "personal");
    // The owner created this draft: self-approval is replaced by the configured delegate.
    // No delegate exists in this fixture, so submitting requires administrative configuration.
    assert.deepEqual(expense.meta.route, [a.manager.memberId, null]);
    click("[data-page=advances]");
    click("[data-action=advance-new]");
    assert.ok(d.querySelector("[name=handoverFiles]").required);
    assert.ok(d.querySelector("[name=purpose]"));
    assert.equal(d.querySelector("[name=committee_id]").tagName, "SELECT");
    click("[data-action=close-modal]");
    click("[data-page=assets]");
    click("[data-action=asset-new]");
    assert.ok(d.querySelector("[name=unit_value]"));
    val("ownership", "rented").dispatchEvent(
      new w.Event("change", { bubbles: true }),
    );
    assert.equal(d.querySelector("[data-rental-fields]").hidden, false);
    click("[data-action=close-modal]");
    click("[data-page=suppliers]");
    click("[data-action=supplier-new]");
    assert.ok(d.querySelector("[name=iban]"));
    assert.ok(d.querySelector("[name=supplierFiles]"));
    click("[data-action=close-modal]");
    click("[data-page=media]");
    click("[data-action=media-new]");
    val("name", "ملف إعلامي من الواجهة");
    click("[data-add-account]");
    d.querySelector("[data-key=handle]").value = "test";
    d.querySelector("[data-key=followers]").value = "4000";
    click("[data-add-work]");
    d.querySelector("[data-key=title]").value = "تغطية الزيارة";
    await submit();
    await wait(() => d.querySelector("[data-action=media-detail]"));
    click("[data-action=media-detail]");
    assert.ok(
      d.querySelector("#modalBody").textContent.includes("تغطية الزيارة"),
    );
    click("[data-action=close-modal]");
    click("[data-page=suppliers]");
    click("[data-action=supplier-new]");
    let chosen;
    w.L = {
      map: () => ({
        setView() {
          return this;
        },
        on(k, fn) {
          if (k === "click") chosen = fn;
          return this;
        },
        getCenter() {
          return { lat: 24.8, lng: 46.9 };
        },
        remove() {},
        invalidateSize() {},
      }),
      tileLayer: () => ({
        addTo() {
          return this;
        },
        on() {
          return this;
        },
      }),
      marker: () => ({
        addTo() {
          return this;
        },
        on() {
          return this;
        },
        setLatLng() {
          return this;
        },
      }),
    };
    click("[data-geo-map]");
    await wait(() => d.querySelector(".map-picker"));
    chosen({ latlng: { lat: 24.8, lng: 46.9 } });
    click("[data-map-save]");
    assert.equal(d.querySelector("[name=geo_lat]").value, "24.800000");
    assert.equal(d.querySelector("[name=geo_lng]").value, "46.900000");
    assert.equal(d.querySelector("[name=geo_lat]").type, "hidden");
    click("[data-action=close-modal]");
    click("[data-action=assistant]");
    await wait(() => d.querySelector("#assistant").dataset.loading === "false");
    assert.ok(d.querySelector("#assistantBody").textContent.includes("سَنَد"));
    assert.equal(
      d.querySelectorAll("#assistantBody .sanad-tools button").length,
      6,
    );
    assert.ok(d.querySelector("#sanadChatForm [name=message]"));
    click("[data-action=sanad-guide]");
    assert.ok(d.querySelector("#guideForm"));
    assert.ok(
      d.querySelector("#guideForm").textContent.includes("القالب المعتمد"),
    );
    click("[data-action=close-assistant]");
    click("[data-page=settings]");
    click("[data-action=settings-tab][data-tab=sanad]");
    assert.ok(d.querySelector("[name=sanad_context]"));
    assert.equal(d.querySelector("[name=sanad_retention]").value, "30");
    click("[data-action=settings-tab][data-tab=connections]");
    click("[data-action=readiness-check]");
    await wait(() =>
      d.querySelector("#readinessResult").textContent.includes("مسارات اللجان"),
    );
    assert.ok(
      d
        .querySelector("#readinessResult")
        .textContent.includes("الدخول المستقل بالجوال"),
    );
    click("[data-action=maintenance-run]");
    await wait(() =>
      d
        .querySelector("#readinessResult")
        .textContent.includes("آخر دورة صيانة: 20"),
    );
    assert.equal(errors.length, 0, errors.map(String).join("\n"));
  } finally {
    dom.window.close();
    a.DB.close();
  }
});
