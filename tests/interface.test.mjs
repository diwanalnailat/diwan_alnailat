import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker, { dispatchNotifications } from "../worker.js";
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
  let pendingRequests = 0;
  let locationDelay;
  let lastCommitteeSave, lastExpenseSave;
  w.fetch = async (path, opts = {}) => {
    pendingRequests++;
    try {
      if (path === "/api/committees/save")
        lastCommitteeSave = JSON.parse(opts.body);
      if (path === "/api/expenses/save")
        lastExpenseSave = JSON.parse(opts.body);
      if (String(path).endsWith("/location/resolve") && locationDelay)
        await locationDelay;
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
      return await worker.fetch(
        new Request(new URL(path, w.location.origin), {
          ...opts,
          headers,
          body,
        }),
        a.env,
      );
    } finally {
      pendingRequests--;
    }
  };
  w.addEventListener("error", (e) => errors.push(e.error));
  w.eval(fs.readFileSync("public/vendor/qrcode.js", "utf8"));
  w.eval(fs.readFileSync("public/asset-labels.js", "utf8"));
  for (const file of [
    "typography",
    "workspace",
    "workspace-views",
    "heritage-admin",
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
  const click = async (sel) => {
      const e = d.querySelector(sel);
      assert.ok(e, "Missing " + sel);
      e.click();
      await tick(0);
      await wait(() => pendingRequests === 0);
      await tick(0);
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
    await wait(() => d.querySelectorAll(".nw-season").length === 5);
    assert.ok(d.body.classList.contains("landing-mode"));
    assert.ok(
      d
        .querySelector(".nw-honor-photo img")
        .src.endsWith("/brand/honoring.jpg"),
    );
    assert.equal(d.querySelectorAll(".nw-season").length, 5);
    assert.equal(d.querySelectorAll(".nw-season:not([hidden])").length, 1);
    await click('[data-nailat-edition="7"]');
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
    await click(".heritage-nav [data-page=overview]");
    await wait(() => !d.body.classList.contains("landing-mode"));
    assert.ok(d.querySelector(".command-hero"));
    await click('[data-page="heritage_results"]');
    await wait(() => d.querySelectorAll(".heritage-season-card").length === 5);
    await click('[data-action="heritage-season-new"]');
    await wait(() => d.querySelector("#modal").open);
    val("season", "2027–2028");
    val("edition", "12");
    val("title", '<img src=x onerror="throw 1">');
    await click("[data-award-add]");
    val("award_title", "نتيجة اختبار");
    val("award_rank", "2");
    val("award_date", "2028-01-02");
    val("award_camel", "مطية اختبار");
    await click("[data-award-add]");
    d.querySelectorAll('[name="award_title"]')[1].value = "نتيجة ثانية";
    await click('.heritage-award-editor:nth-child(2) [data-award-move="-1"]');
    assert.equal(d.querySelector('[name="award_title"]').value, "نتيجة ثانية");
    await click(".heritage-award-editor [data-award-remove]");
    await submit();
    await wait(() => d.querySelectorAll(".heritage-season-card").length === 6);
    assert.equal(d.querySelector("#heritageResultsPanel img"), null);
    const published = (await a.req("heritage-results", undefined, null)).data
      .seasons;
    assert.equal(published[0].edition, "12");
    assert.equal(published[0].awards.length, 1);
    assert.equal(published[0].awards[0].camel, "مطية اختبار");
    await click('[data-action="heritage-season-edit"][data-id="12"]');
    await wait(() => d.querySelector("#modal").open);
    val("title", "عنوان معدل");
    // Another admin saved while this dialog was open: stale edits must remain visible.
    const concurrent = await a.req("heritage-results/manage");
    await a.req("heritage-results/save", { ...concurrent.data });
    d.querySelector("#modalBody form").dispatchEvent(
      new w.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: d.querySelector('#modalBody [type="submit"]'),
      }),
    );
    await wait(() => !d.querySelector("#modalBody .form-error").hidden);
    assert.equal(d.querySelector("#modal").open, true);
    assert.equal(
      d.querySelector('#modalBody [name="title"]').value,
      "عنوان معدل",
    );
    await click('[data-action="close-modal"]');
    await click('[data-action="heritage-season-edit"][data-id="12"]');
    await wait(() => d.querySelector("#modal").open);
    val("title", "عنوان معدل");
    await submit();
    await wait(() =>
      d
        .querySelector("#heritageResultsPanel")
        .textContent.includes("عنوان معدل"),
    );
    await click('[data-action="heritage-season-delete"][data-id="12"]');
    await wait(() => d.querySelector("#modal").open);
    await submit();
    await wait(() => d.querySelectorAll(".heritage-season-card").length === 5);
    await click('[data-page="overview"]');
    await wait(() => d.querySelector(".command-hero"));
    w.innerWidth = 390;
    w.dispatchEvent(new w.Event("resize"));
    assert.equal(d.querySelector("#sidebar").inert, true);
    await click(".mobile-menu");
    assert.equal(d.querySelector("#sidebar").inert, false);
    assert.equal(
      d.querySelector(".mobile-menu").getAttribute("aria-expanded"),
      "true",
    );
    await click(".menu-backdrop");
    assert.equal(d.querySelector("#sidebar").inert, true);
    w.innerWidth = 1280;
    w.dispatchEvent(new w.Event("resize"));
    assert.equal(d.querySelectorAll(".metric-card").length, 4);
    assert.doesNotMatch(
      d.querySelector(".command-hero h1").textContent,
      /[،.]/,
    );
    await click("[data-page=services]");
    assert.equal(d.querySelectorAll(".service-group").length, 4);
    await click("[data-action=service-filter][data-filter-value=field]");
    assert.equal(d.querySelectorAll(".service-group").length, 1);
    await click("[data-page=calendar]");
    await click("[data-action=schedule-filter][data-filter-value=all]");
    assert.equal(
      d.querySelector("[data-filter-value=all]").getAttribute("aria-pressed"),
      "true",
    );
    await click("[data-page=decisions]");
    assert.ok(d.querySelector(".filter-chips"));
    await click("[data-page=field]");
    assert.ok(d.querySelector("#projectFilter"));
    await click("[data-page=reports]");
    assert.ok(d.querySelector("[data-action=workspace-export]"));
    await click("[data-page=profile]");
    assert.match(d.querySelector("#main").textContent, /مستحقاتي الشخصية/);
    await click("[data-page=projects]");
    await click("[data-action=project-edit]");
    assert.equal(d.querySelector('[name="supervisor_id"]'), null);
    await submit();
    await click("[data-page=assets]");
    await click("[data-action=asset-new]");
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
    await click("[data-action=asset-lookup]");
    val("lookup_code", savedAsset.serial);
    await click("#modalBody [type=submit]");
    assert.match(d.querySelector("#modalBody").textContent, /كرفان ميداني/);
    assert.ok(
      d.querySelector('#modalBody a[href^="https://www.google.com/maps/dir/"]'),
    );
    await click("[data-action=asset-label]");
    assert.ok(d.querySelector("[data-label-preview] svg"));
    assert.ok(
      d
        .querySelector("[data-label-preview]")
        .textContent.includes(savedAsset.serial),
    );
    assert.ok(d.querySelector("[data-label-pdf]"));
    await click("[data-action=close-modal]");
    await click("[data-page=committees]");
    await click("[data-action=committee-edit]");
    assert.equal(val("second_approver_id", "owner").tagName, "SELECT");
    assert.equal(d.querySelectorAll("[data-budget-line]").length, 0);
    assert.equal(d.querySelector("[data-action=budget-add]"), null);
    assert.ok(d.querySelector("[name=catalog_tags]"));
    await submit();
    assert.equal(Object.hasOwn(lastCommitteeSave.config, "budgetLines"), false);
    assert.equal(
      (await state(a)).committees[0].config.budgetLines[0].budget,
      1000000,
    );
    await click("[data-page=users]");
    await click("[data-action=user-new]");
    val("name", "عضو من الواجهة");
    val("status", "active");
    val("phone", "+966500123456");
    await click("[data-action=member-next]");
    await wait(() => d.querySelector("#memberForm").dataset.step === "1");
    await click("[data-action=member-link-add]");
    val("link_committee", a.cid);
    val("link_role", "member");
    await click("[data-action=member-next]");
    await wait(() => d.querySelector("#memberForm").dataset.step === "2");
    assert.ok(d.querySelector("#memberReview").textContent.includes("سجلاته"));
    await submit();
    const member = (await state(a)).members.find(
      (m) => m.name === "عضو من الواجهة",
    );
    assert.ok(
      (await state(a)).committees[0].members.some((m) => m.id === member.id),
    );
    await click("[data-page=tasks]");
    await click("[data-action=task-new]");
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
    await click("[data-action=task-transition][data-next=doing]");
    await submit();
    const task = (await state(a)).tasks.find(
      (t) => t.title === "تنظيم استقبال الضيوف",
    );
    assert.equal(task.status, "doing");
    await click("[data-page=expenses]");
    await click("[data-action=expense-new]");
    assert.equal(d.querySelector("[name=budget_line_id]"), null);
    assert.equal(d.querySelector("#modalBody [name=category]"), null);
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
    assert.equal(Object.hasOwn(lastExpenseSave, "budget_line_id"), false);
    assert.equal(Object.hasOwn(expense.meta, "budget_line_id"), false);
    assert.equal(Object.hasOwn(expense.meta, "budget_line_name"), false);
    assert.equal(expense.category, "");
    assert.equal(expense.meta.funding_source, "personal");
    // The owner created this draft: self-approval is replaced by the configured delegate.
    // No delegate exists in this fixture, so submitting requires administrative configuration.
    assert.deepEqual(expense.meta.route, [a.manager.memberId, null]);
    await click("[data-page=advances]");
    await click("[data-action=advance-new]");
    assert.ok(d.querySelector("[name=handoverFiles]").required);
    assert.ok(d.querySelector("[name=purpose]"));
    assert.equal(d.querySelector("[name=committee_id]").tagName, "SELECT");
    await click("[data-action=close-modal]");
    await click("[data-page=assets]");
    await click("[data-action=asset-new]");
    assert.ok(d.querySelector("[name=unit_value]"));
    val("ownership", "rented").dispatchEvent(
      new w.Event("change", { bubbles: true }),
    );
    assert.equal(d.querySelector("[data-rental-fields]").hidden, false);
    await click("[data-action=close-modal]");
    await click("[data-page=suppliers]");
    await click("[data-action=supplier-new]");
    assert.ok(d.querySelector("[name=iban]"));
    assert.ok(d.querySelector("[name=supplierFiles]"));
    await click("[data-action=close-modal]");
    await click("[data-page=media]");
    await click("[data-action=media-new]");
    val("name", "ملف إعلامي من الواجهة");
    await click("[data-add-account]");
    d.querySelector("[data-key=handle]").value = "test";
    d.querySelector("[data-key=followers]").value = "4000";
    await click("[data-add-work]");
    d.querySelector("[data-key=title]").value = "تغطية الزيارة";
    await submit();
    await wait(() => d.querySelector("[data-action=media-detail]"));
    await click("[data-action=media-detail]");
    assert.ok(
      d.querySelector("#modalBody").textContent.includes("تغطية الزيارة"),
    );
    await click("[data-action=close-modal]");
    await click("[data-page=suppliers]");
    await click("[data-action=supplier-new]");
    let chosen, mapCenter;
    w.L = {
      map: () => ({
        setView(point) {
          mapCenter = point;
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
    await click("[data-geo-map]");
    await wait(() => d.querySelector(".map-picker"));
    const mapLink = d.querySelector("#map-google-url");
    assert.ok(mapLink);
    mapLink.value = "https://maps.google.com/?q=25.1,47.2";
    await click("[data-map-resolve]");
    await wait(() => !d.querySelector("[data-map-save]").disabled);
    await click("[data-map-save]");
    assert.equal(d.querySelector("[name=geo_lat]").value, "25.100000");
    assert.equal(d.querySelector("[name=geo_map_url]").value, mapLink.value);
    await click("[data-geo-map]");
    await wait(() => d.querySelector(".map-picker"));
    chosen({ latlng: { lat: 24.8, lng: 46.9 } });
    await click("[data-map-save]");
    assert.equal(d.querySelector("[name=geo_lat]").value, "24.800000");
    assert.equal(d.querySelector("[name=geo_lng]").value, "46.900000");
    assert.match(
      d.querySelector("[name=geo_map_url]").value,
      /24.800000,46.900000/,
    );
    assert.equal(d.querySelector("[name=geo_lat]").type, "hidden");
    await click("[data-action=close-modal]");
    await click("[data-page=projects]");
    await click("[data-action=project-new]");
    val("title", "مشروع اختبار رابط الموقع");
    const projectLink = d.querySelector("#project-google-url");
    assert.ok(projectLink, "Google Maps link is visible in the project form");
    const pasteLink = (url) => {
      projectLink.value = url;
      projectLink.dispatchEvent(new w.Event("input", { bubbles: true }));
    };
    pasteLink("https://maps.google.com/?q=25.1,47.2");
    await wait(() => d.querySelector("[name=geo_lat]").value === "25.100000");
    await wait(() => !d.querySelector(".project-location-preview").hidden);
    assert.equal(mapCenter.join(","), "25.1,47.2");
    pasteLink("https://example.test/private");
    await wait(() => projectLink.getAttribute("aria-invalid") === "true");
    assert.equal(projectLink.validity.valid, false);
    const projectForm = d.querySelector("#modalBody form");
    projectForm.dispatchEvent(
      new w.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: projectForm.querySelector("[type=submit]"),
      }),
    );
    await wait(() => !projectForm.querySelector(".form-error").hidden);
    assert.equal(
      d.querySelector("#modal").open,
      true,
      "invalid links cannot silently save old coordinates",
    );
    await click("[data-geo-clear]");
    assert.equal(projectLink.value, "");
    assert.equal(projectLink.validity.valid, true);
    assert.equal(d.querySelector("[name=geo_lat]").value, "");
    let releaseLocation;
    locationDelay = new Promise((resolve) => {
      releaseLocation = resolve;
    });
    pasteLink("https://maps.google.com/?q=26,48");
    await wait(() => pendingRequests > 0);
    d.querySelector("[data-geo-clear]").click();
    releaseLocation();
    locationDelay = null;
    await wait(() => pendingRequests === 0);
    assert.equal(
      d.querySelector("[name=geo_lat]").value,
      "",
      "clearing ignores an older in-flight result",
    );
    pasteLink("https://www.google.com/maps/search/24.7136,+46.6753?entry=tts");
    await submit(); // Save immediately, before debounce: resolution must finish first.
    const mappedProject = (await state(a)).projects.find(
      (p) => p.title === "مشروع اختبار رابط الموقع",
    );
    assert.equal(mappedProject.meta.site_location.lat, 24.7136);
    assert.equal(mappedProject.meta.site_location.lng, 46.6753);
    assert.equal(mappedProject.meta.site_location.map_url, projectLink.value);
    await click(`[data-action=project-edit][data-id="${mappedProject.id}"]`);
    assert.equal(
      d.querySelector("#project-google-url").value,
      mappedProject.meta.site_location.map_url,
    );
    await click("[data-geo-map]");
    await wait(() => d.querySelector(".map-picker"));
    chosen({ latlng: { lat: 24.8, lng: 46.9 } });
    await click("[data-map-save]");
    assert.match(
      d.querySelector("#project-google-url").value,
      /24.800000,46.900000/,
    );
    await submit();
    assert.equal(
      (await state(a)).projects.find((p) => p.id === mappedProject.id).meta
        .site_location.lat,
      24.8,
    );
    await click("[data-page=committees]");
    const sharedModal = d.querySelector("#modal");
    sharedModal.scrollTop = 640;
    d.querySelector("#modalBody").scrollTop = 320;
    await click("[data-action=committee-new]");
    assert.equal(d.querySelector("#budgetCatalog"), null);
    assert.equal(d.querySelector("[data-action=budget-add]"), null);
    assert.ok(d.querySelector("[name=catalog_tags]"));
    assert.equal(
      sharedModal.scrollTop,
      0,
      "first committee opens at the top after another form",
    );
    assert.equal(d.querySelector("#modalBody").scrollTop, 0);
    assert.equal(d.activeElement, d.querySelector("#modalTitle"));
    assert.equal(sharedModal.getAttribute("aria-labelledby"), "modalTitle");
    val("name", "مسودة لجنة");
    sharedModal.scrollTop = 480;
    d.querySelector("[name=name]").focus();
    assert.equal(
      sharedModal.scrollTop,
      480,
      "editing does not reset the user's scroll",
    );
    await click("[data-action=close-modal]");
    await click("[data-action=committee-new]");
    assert.equal(
      sharedModal.scrollTop,
      0,
      "reopening also resets the retained scroll",
    );
    assert.equal(d.activeElement, d.querySelector("#modalTitle"));
    const managerPicker = d.querySelector('[data-person-picker="manager_id"]');
    assert.equal(
      managerPicker.querySelector(".person-picker-fields").hidden,
      true,
    );
    val("name", "لجنة المدير الجديد");
    await click(
      '[data-person-picker="manager_id"] [data-action="inline-person-toggle"]',
    );
    assert.equal(
      managerPicker.querySelector("[data-person-name]").required,
      true,
    );
    assert.equal(
      managerPicker.querySelector("[data-person-email]").required,
      false,
    );
    managerPicker.querySelector("[data-person-name]").value =
      "مدير اختبار الواجهة";
    managerPicker.querySelector("[data-person-phone]").value = "0500000031";
    await click(
      '[data-person-picker="manager_id"] [data-action="inline-person-toggle"]',
    );
    assert.equal(d.querySelector("[name=manager_id]").disabled, false);
    assert.equal(
      managerPicker.querySelector("[data-person-name]").disabled,
      true,
    );
    await click(
      '[data-person-picker="manager_id"] [data-action="inline-person-toggle"]',
    );
    assert.equal(
      managerPicker.querySelector("[data-person-name]").value,
      "مدير اختبار الواجهة",
    );
    await click(
      '[data-person-picker="manager_id"] [data-action="inline-person-add"]',
    );
    let managerMessage = "";
    Object.assign(a.env, {
      DIWAN_AUTH_ENABLED: "true",
      WHATSAPP_ENABLED: "true",
      WHATSAPP_PROVIDER: "green_api",
      APP_BASE_URL: "https://diwan.test",
      OTP_SECRET: "a".repeat(48),
      GREEN_API_URL: "https://7107.api.greenapi.com",
      GREEN_API_INSTANCE: "1234567890",
      GREEN_API_TOKEN: "test-token-not-a-real-credential",
      PROVIDER_FETCH: async (_, opts) => {
        managerMessage = JSON.parse(opts.body).message;
        return Response.json({ idMessage: "ui-test-message" });
      },
    });
    await submit();
    await dispatchNotifications(a.env);
    assert.match(managerMessage, /لجنة المدير الجديد/);
    const newCommittee = (await state(a)).committees.find(
      (c) => c.name === "لجنة المدير الجديد",
    );
    assert.ok(newCommittee.manager_id);
    const newManager = await a.DB.prepare(
      "SELECT name,email,phone FROM nl_members WHERE id=?",
    )
      .bind(newCommittee.manager_id)
      .first();
    assert.equal(newManager.email, null);
    assert.equal(newManager.phone, "+966500000031");
    assert.equal(newManager.name, "مدير اختبار الواجهة");
    await click("[data-action=assistant]");
    await wait(() => d.querySelector("#assistant").dataset.loading === "false");
    assert.ok(d.querySelector("#assistantBody").textContent.includes("سَنَد"));
    assert.equal(
      d.querySelectorAll("#assistantBody .sanad-tools button").length,
      6,
    );
    assert.ok(d.querySelector("#sanadChatForm [name=message]"));
    await click("[data-action=sanad-guide]");
    assert.ok(d.querySelector("#guideForm"));
    assert.ok(
      d.querySelector("#guideForm").textContent.includes("القالب المعتمد"),
    );
    await click("[data-action=close-assistant]");
    await click("[data-page=settings]");
    await click("[data-action=settings-tab][data-tab=sanad]");
    assert.ok(d.querySelector("[name=sanad_context]"));
    assert.equal(d.querySelector("[name=sanad_retention]").value, "30");
    await click("[data-action=settings-tab][data-tab=connections]");
    await click("[data-action=readiness-check]");
    await wait(() =>
      d.querySelector("#readinessResult").textContent.includes("مسارات اللجان"),
    );
    assert.ok(
      d
        .querySelector("#readinessResult")
        .textContent.includes("الدخول المستقل بالجوال"),
    );
    await click("[data-action=maintenance-run]");
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
