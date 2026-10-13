import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import worker from "../worker.js";
import { fixture, owner } from "./support.mjs";

async function exerciseInvoiceForm(configured = true) {
  const a = await fixture();
  if (configured)
    Object.assign(a.env, {
      AI_ENABLED: "true",
      OPENAI_API_KEY: "synthetic-only",
      OPENAI_MODEL: "offline-model",
    });
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/#expenses",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document,
    errors = [],
    reads = [],
    uploads = [],
    saves = [];
  let pending = 0;
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.addEventListener("error", (event) => errors.push(event.error));
  const Native = w.FormData;
  w.FormData = class extends Native {
    constructor(form) {
      super(form);
      if (form?.classList.contains("expense-editor")) {
        for (const input of form.querySelectorAll('input[type="file"]')) {
          this.delete(input.name);
          for (const file of input.files) this.append(input.name, file);
        }
      }
    }
  };
  w.fetch = async (path, options = {}) => {
    pending++;
    try {
      if (path === "/api/upload") {
        uploads.push(options.body);
        return Response.json({ id: `synthetic-${uploads.length}` });
      }
      if (path === "/api/extract")
        return await new Promise((resolve) =>
          reads.push({ file: JSON.parse(options.body).file_id, resolve }),
        );
      if (path === "/api/expenses/save") {
        saves.push(JSON.parse(options.body));
        return Response.json({ id: "saved-draft" });
      }
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
    for (let i = 0; i < 250; i++) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error(
      `UI timeout: ${d.querySelector("#toast")?.textContent} ${errors.map(String)}`,
    );
  };
  const result = (amount) =>
    Response.json({
      requires_review: true,
      fields: {
        amount: { value: amount, confidence: "clear" },
        tax: { value: "15.00", confidence: "clear" },
        date: { value: "2021-03-14", confidence: "clear" },
        number: { value: "INV-42", confidence: "clear" },
        description: { value: "<script>bad()</script>", confidence: "clear" },
        supplier_name: { value: null, confidence: "missing" },
      },
    });
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
      () => d.querySelector('[data-action="expense-new"]') && !pending,
    );
    d.querySelector('[data-action="expense-new"]').click();
    await wait(() => d.querySelector(".expense-editor"));
    const f = d.querySelector(".expense-editor"),
      input = f.querySelector('[name="invoiceFiles"]');
    const choose = (name, type = "application/pdf") => {
      Object.defineProperty(input, "files", {
        value: [new w.File(["%PDF-1.7 synthetic"], name, { type })],
        configurable: true,
      });
      input.dispatchEvent(new w.Event("change", { bubbles: true }));
    };
    const field = (name) => f.elements.namedItem(name);
    field("title").value = "User supplied description";
    choose("first.pdf");
    if (!configured) {
      assert.equal(
        uploads.length,
        0,
        "unconfigured AI must not upload orphan drafts",
      );
      assert.equal(reads.length, 0);
      assert.equal(saves.length, 0);
      assert.match(
        f.querySelector("#extractionResult").textContent,
        /بانتظار تفعيل الربط/,
      );
      assert.equal(f.invoiceReading, false);
      assert.equal(
        f.querySelector("#extractionResult").getAttribute("aria-busy"),
        "false",
      );
      return;
    }
    await wait(() => reads.length === 1);
    assert.equal(f.invoiceReading, true);
    field("amount").value = "77.00";
    field("amount").dispatchEvent(new w.Event("input", { bubbles: true }));
    reads[0].resolve(result("115.00"));
    await wait(() => !f.invoiceReading);
    assert.equal(
      field("amount").value,
      "77.00",
      "late result must preserve typing",
    );
    assert.equal(
      field("title").value,
      "User supplied description",
      "existing text must remain",
    );
    assert.equal(
      field("tax").value,
      "15.00",
      "new default zero is replaceable",
    );
    assert.equal(field("number").value, "INV-42");
    assert.equal(
      field("date").value,
      "2021-03-14",
      "untouched default date must be replaced by invoice date",
    );
    assert.equal(f.querySelector("#extractionResult script"), null);
    assert.equal(
      f.querySelector("#extractionResult").getAttribute("aria-busy"),
      "false",
    );
    assert.equal(saves.length, 0, "reading never saves or submits an expense");
    choose(
      "second.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    await wait(() => reads.length === 2);
    choose(
      "third.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await wait(() => reads.length === 3);
    reads[2].resolve(result("333.00"));
    await wait(() => !f.invoiceReading);
    reads[1].resolve(result("222.00"));
    await wait(() => !pending);
    assert.match(
      f.querySelector("#extractionResult").textContent,
      /third.xlsx/,
    );
    assert.ok(
      !f.querySelector("#extractionResult").textContent.includes("222.00"),
    );
    assert.equal(field("amount").value, "77.00");
    assert.equal(uploads.length, 3);
    f.querySelector('[type="submit"][value="draft"]').click();
    await wait(() => saves.length === 1 && !pending);
    assert.deepEqual(
      saves[0].files,
      ["synthetic-3"],
      "only currently selected cached upload is attached",
    );
    assert.equal(uploads.length, 3, "save must not upload selected file twice");
    assert.equal(saves[0].status, "draft");
    d.querySelector('[data-action="expense-new"]').click();
    await wait(
      () =>
        d.querySelector(".expense-editor") !== f &&
        d.querySelector("#modal").open,
    );
    const freshForm = d.querySelector(".expense-editor");
    const freshInput = freshForm.querySelector('[name="invoiceFiles"]');
    Object.defineProperty(freshInput, "files", {
      value: [
        new w.File(["%PDF-1.7 synthetic"], "fresh.pdf", {
          type: "application/pdf",
        }),
      ],
    });
    freshInput.dispatchEvent(new w.Event("change", { bubbles: true }));
    await wait(() => reads.length === 4);
    reads[3].resolve(result("115.00"));
    await wait(() => !freshForm.invoiceReading);
    assert.equal(freshForm.elements.namedItem("amount").value, "115.00");
    assert.equal(freshForm.elements.namedItem("date").value, "2021-03-14");
    assert.equal(
      saves.length,
      1,
      "new autofill still never saves automatically",
    );
    assert.deepEqual(errors, []);
  } finally {
    for (const read of reads) read.resolve(result("0"));
    dom.window.close();
    await a.DB.close();
  }
}
test("expense form auto-reads selection, preserves user edits, ignores stale files and reuses uploads only on explicit save", () =>
  exerciseInvoiceForm());
test("unconfigured Sanad leaves financial document selection and manual entry available without an upload", () =>
  exerciseInvoiceForm(false));
