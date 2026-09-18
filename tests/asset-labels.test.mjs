import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fixture, state, owner, upload } from "./support.mjs";
import { database } from "../scripts/sqlite.mjs";
import qrcode from "qrcode-generator";
import { jsPDF } from "jspdf";
import "../public/asset-labels.js";
const payload = {
  name: "درع تكريم",
  kind: "serialized",
  quantity: 1,
  ownership: "owned",
  category: "دروع وتذكارات التكريم",
};

test("automatic asset numbers persist across edits, grouped creation, attachments, retries and movements", async () => {
  const a = await fixture();
  try {
    const file = await upload(a, "assets", "asset");
    const body = { ...payload, count: 3, files: [file] };
    const r = await a.req("assets/save", body, owner, {
      key: "asset-batch-retry-0001",
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.ids.length, 3);
    let s = await state(a),
      records = r.data.ids.map((id) => s.assets.find((x) => x.id === id));
    assert.deepEqual(
      records.map((x) => x.serial),
      ["NL-00000001", "NL-00000002", "NL-00000003"],
    );
    assert.equal(new Set(records.map((x) => x.meta.batch_id)).size, 1);
    for (const asset of records) {
      assert.equal(asset.quantity, 1);
      assert.equal(
        s.files.filter(
          (f) => f.entity_type === "assets" && f.entity_id === asset.id,
        ).length,
        1,
      );
    }
    const retry = await a.req("assets/save", body, owner, {
      key: "asset-batch-retry-0001",
    });
    assert.deepEqual(retry.data, r.data);
    assert.equal((await state(a)).assets.length, 3);
    const id = records[0].id,
      serial = records[0].serial;
    let edit = await a.req("assets/save", {
      ...payload,
      id,
      version: 1,
      serial: "NL-99999999",
    });
    assert.equal(edit.status, 400);
    edit = await a.req("assets/save", {
      ...payload,
      id,
      version: 1,
      name: "درع بعد الجرد",
      serial,
    });
    assert.equal(edit.status, 200);
    assert.equal(
      (await state(a)).assets.find((x) => x.id === id).serial,
      serial,
    );
    assert.equal(
      (
        await a.req("assets/move", {
          id,
          type: "issue",
          quantity: 1,
          member_id: a.member.memberId,
          project_id: a.pid,
        })
      ).status,
      200,
    );
    s = await state(a);
    assert.equal(s.assets.find((x) => x.id === id).available, 0);
    assert.equal(s.assets.find((x) => x.id === records[1].id).available, 1);
    assert.equal((await a.req("assets/save", body, a.outsider)).status, 403);
    assert.equal((await state(a, a.outsider)).assets.length, 0);
    const next = await a.req("assets/save", {
      ...payload,
      kind: "quantity",
      quantity: 20,
    });
    assert.equal(next.status, 200);
    assert.equal(
      (await state(a)).assets.find((x) => x.id === next.data.id).serial,
      "NL-00000004",
    );
    await assert.rejects(
      () =>
        a.DB.prepare("UPDATE nl_assets SET serial=? WHERE id=?")
          .bind(serial, next.data.id)
          .run(),
      /UNIQUE/,
    );
    for (const extra of [
      { count: 51 },
      { count: 1.5 },
      { count: 2, kind: "quantity" },
      { count: 2, manufacturer_serial: "SAME" },
    ])
      assert.equal(
        (await a.req("assets/save", { ...payload, ...extra })).status,
        400,
      );
  } finally {
    a.DB.close();
  }
});

test("asset-number migration preserves printed codes, fills blanks, and allocates beyond legacy numbers", async () => {
  const db = database();
  try {
    for (const f of fs
      .readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql") && !f.startsWith("0005"))
      .sort())
      await db.exec(fs.readFileSync("drizzle/" + f, "utf8"));
    for (const [id, serial] of [
      ["old", "NL-00000050"],
      ["empty", null],
      ["vendor", "VENDOR-CODE"],
    ])
      await db
        .prepare(
          "INSERT INTO nl_assets(id,name,quantity,serial,created_by,created) VALUES(?,?,1,?,'owner','2025-01-01')",
        )
        .bind(id, id, serial)
        .run();
    await db.exec(fs.readFileSync("drizzle/0005_asset_numbers.sql", "utf8"));
    const rows = (
      await db.prepare("SELECT id,serial FROM nl_assets ORDER BY id").all()
    ).results;
    assert.equal(rows.find((x) => x.id === "old").serial, "NL-00000050");
    assert.equal(rows.find((x) => x.id === "vendor").serial, "VENDOR-CODE");
    assert.equal(rows.find((x) => x.id === "empty").serial, "NL-00000051");
    await db
      .prepare("INSERT INTO nl_asset_numbers(asset_id) VALUES('new')")
      .run();
    assert.equal(
      (
        await db
          .prepare("SELECT number FROM nl_asset_numbers WHERE asset_id='new'")
          .first()
      ).number,
      54,
    );
    await db.prepare("DELETE FROM nl_asset_numbers WHERE asset_id='new'").run();
    await db
      .prepare("INSERT INTO nl_asset_numbers(asset_id) VALUES('later')")
      .run();
    assert.equal(
      (
        await db
          .prepare("SELECT number FROM nl_asset_numbers WHERE asset_id='later'")
          .first()
      ).number,
      55,
    );
  } finally {
    db.close();
  }
});

test("label output encodes the saved record, escapes names, and produces actual-size PDFs without allocating numbers", async () => {
  globalThis.qrcode = qrcode;
  globalThis.jspdf = { jsPDF };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(fs.readFileSync("public/tajawal-pdf.ttf"));
  try {
    const asset = {
      ...payload,
      id: "32ef97c6-f3ea-4d27-af0a-a9eef3dacdb8",
      serial: "NL-00000001",
    };
    const l = globalThis.DiwanLabels;
    assert.equal(
      l.layout(asset, "tze36", "link", "https://diwan.test").payload,
      "https://diwan.test/#assets?asset=" + asset.id,
    );
    assert.equal(
      l.layout(asset, "tze24", "code", "https://diwan.test").payload,
      asset.serial,
    );
    const svg = l.labelSVG(
      { ...asset, name: "<script>alert(1)</script>" },
      "tze36",
      "link",
      "https://diwan.test",
    );
    assert.ok(!svg.includes("<script>"));
    assert.ok(svg.includes('width="70mm"'));
    for (const key of Object.keys(l.presets)) {
      const bytes = await l.pdf([asset], key, "link", "https://diwan.test");
      const pdf = Buffer.from(bytes).toString("latin1");
      assert.ok(pdf.startsWith("%PDF-"));
      const [, w, h] = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
      const target = l.presets[key];
      assert.ok(
        Math.abs((Number(w) / 72) * 25.4 - (target.sheet ? 210 : target.w)) <
          0.01,
      );
      assert.ok(
        Math.abs((Number(h) / 72) * 25.4 - (target.sheet ? 297 : target.h)) <
          0.01,
      );
    }
    const bytes = await l.pdf(
      Array.from({ length: 15 }, (_, i) => ({
        ...asset,
        serial: `NL-${String(i + 1).padStart(8, "0")}`,
      })),
      "a4",
      "code",
      "https://diwan.test",
    );
    assert.match(Buffer.from(bytes).toString("latin1"), /\/Count 2\b/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
