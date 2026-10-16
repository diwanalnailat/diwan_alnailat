import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner, state } from "./support.mjs";

test("actual asset and media forms save records and keep media out of ordinary suppliers", async () => {
  const a = await fixture();
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#assets",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document,
    saves = [],
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
    if (["/api/assets/save", "/api/suppliers/save"].includes(path))
      saves.push({
        path,
        body: JSON.parse(opts.body),
        status: response.status,
        result: await response.clone().json(),
      });
    return response;
  };
  const wait = async (check) => {
    for (let i = 0; i < 300; i++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error(
      "UI timeout: " +
        d.querySelector("#toast").textContent +
        " " +
        (d.querySelector(".form-error")?.textContent || ""),
    );
  };
  try {
    const supplier = await a.req("suppliers/save", { name: "مؤجر الاختبار" });
    assert.equal(supplier.status, 200);
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
    await wait(() => d.querySelector("[data-action=asset-new]"));
    for (const example of [
      { name: "أصل فردي للاختبار", kind: "serialized", count: "2" },
      { name: "صنف للاختبار", kind: "quantity", quantity: "8" },
      {
        name: "أصل مستأجر للاختبار",
        kind: "serialized",
        ownership: "rented",
        supplier_id: supplier.data.id,
        rental_start: "2026-10-16",
        rental_end: "2026-10-20",
      },
    ]) {
      d.querySelector("[data-action=asset-new]").click();
      await wait(
        () =>
          d.querySelector("#modal").open && d.querySelector("#modalBody form"),
      );
      const form = d.querySelector("#modalBody form");
      for (const [key, value] of Object.entries(example)) {
        form.elements[key].value = value;
        form.elements[key].dispatchEvent(
          new w.Event("change", { bubbles: true }),
        );
      }
      assert.equal(form.checkValidity(), true);
      const previous = saves.length;
      form.dispatchEvent(
        new w.SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
          submitter: form.querySelector("[type=submit]:not([value=print])"),
        }),
      );
      await wait(() => saves.length > previous);
      assert.equal(saves.at(-1).status, 200, JSON.stringify(saves.at(-1)));
      await wait(
        () =>
          !d.querySelector("#modal").open &&
          !form.querySelector("[type=submit]:not([value=print])").disabled,
      );
    }
    const assets = (await state(a)).assets;
    assert.equal(assets.length, 4);
    assert.equal(new Set(assets.map((asset) => asset.serial)).size, 4);
    assert.ok(assets.every((asset) => /^NL-\d{8}$/.test(asset.serial)));
    assert.equal(assets.find((asset) => asset.kind === "quantity").quantity, 8);
    assert.equal(
      assets.find((asset) => asset.ownership === "rented").meta.supplier_id,
      supplier.data.id,
    );
    d.querySelector("[data-page=media]").click();
    await wait(() => d.querySelector("[data-action=media-new]"));
    d.querySelector("[data-action=media-new]").click();
    await wait(
      () =>
        d.querySelector("#modal").open &&
        d.querySelector("#modalBody [name=role]"),
    );
    const mediaForm = d.querySelector("#modalBody form");
    mediaForm.elements.name.value = "جهة إعلامية للاختبار";
    mediaForm.elements.role.value = "جهة إعلامية";
    mediaForm.dispatchEvent(
      new w.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: mediaForm.querySelector("[type=submit]"),
      }),
    );
    await wait(() => saves.some((save) => save.path === "/api/suppliers/save"));
    assert.equal(saves.at(-1).status, 200, JSON.stringify(saves.at(-1)));
    const mediaId = saves.at(-1).result.id;
    await wait(
      () =>
        !d.querySelector("#modal").open &&
        !mediaForm.querySelector("[type=submit]").disabled,
    );
    assert.ok(
      d.querySelector(`[data-action=media-detail][data-id="${mediaId}"]`),
    );
    const media = (await state(a)).suppliers.find((row) => row.id === mediaId);
    assert.equal(media.meta.media_profile.role, "جهة إعلامية");
    d.querySelector("[data-page=suppliers]").click();
    await wait(() => d.querySelector("[data-action=supplier-new]"));
    assert.ok(
      d.querySelector(
        `[data-action=supplier-edit][data-id="${supplier.data.id}"]`,
      ),
    );
    assert.equal(
      d.querySelector(`[data-action=supplier-edit][data-id="${mediaId}"]`),
      null,
    );
    assert.ok(!d.querySelector("#main").textContent.includes(media.name));
    d.querySelector("[data-page=assets]").click();
    await wait(() => d.querySelector("[data-action=asset-new]"));
    d.querySelector("[data-action=asset-new]").click();
    await wait(
      () =>
        d.querySelector("#modal").open &&
        d.querySelector("#modalBody [name=supplier_id]"),
    );
    assert.ok(
      d.querySelector(
        `#modalBody [name=supplier_id] option[value="${supplier.data.id}"]`,
      ),
    );
    assert.equal(
      d.querySelector(
        `#modalBody [name=supplier_id] option[value="${mediaId}"]`,
      ),
      null,
    );
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
    await a.DB.close();
  }
});
