import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

test("display punctuation is removed without changing money values or stored form content", async () => {
  const dom = new JSDOM(
    '<body><p>النائلات، أصالة. وإنجاز…</p><span id="money">1,234.50 ر.س</span><textarea>النص الأصلي، محفوظ.</textarea><input value="12.50"><a href="/api/files/f">فاتورة.pdf</a></body>',
    { runScripts: "outside-only" },
  );
  const w = dom.window;
  w.eval(fs.readFileSync("public/typography.js", "utf8"));
  const clean = w.DiwanTypography.clean;
  assert.equal(
    clean("قيمة 1,234.50 ريال، اليوم."),
    "قيمة 1,234.50 ريال اليوم ",
  );
  assert.equal(
    clean("البريد user@example.com ورابط https://example.com/a.csv"),
    "البريد user@example.com ورابط https://example.com/a.csv",
  );
  assert.equal(
    w.document.querySelector("textarea").value,
    "النص الأصلي، محفوظ.",
  );
  assert.equal(w.document.querySelector("input").value, "12.50");
  assert.equal(w.document.querySelector("a").textContent, "فاتورة.pdf");
  assert.match(w.document.querySelector("#money").textContent, /1,234\.50/);
  assert.doesNotMatch(w.document.querySelector("p").textContent, /[،.٬…]/);
  const next = w.document.createElement("div");
  next.innerHTML =
    "<h2>تحديث جديد، واضح.</h2><span data-verbatim>مرجع.محفوظ</span>";
  w.document.body.append(next);
  await new Promise((resolve) => w.setTimeout(resolve, 0));
  assert.doesNotMatch(next.querySelector("h2").textContent, /[،.]/);
  assert.equal(next.querySelector("[data-verbatim]").textContent, "مرجع.محفوظ");
  dom.window.close();
});
