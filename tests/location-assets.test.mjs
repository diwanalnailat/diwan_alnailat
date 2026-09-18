import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, state, saveTask } from "./support.mjs";

test("asset and task location persistence, validation, restricted visibility and clearing", async () => {
  const a = await fixture();
  try {
    const geo = {
      label: "خيمة الضيافة",
      lat: "24.7136",
      lng: "46.6753",
      notes: "البوابة الشمالية",
    };
    const payload = {
      name: "كرفان اختبار",
      kind: "serialized",
      ownership: "owned",
      category: "كرفانات",
      quantity: 1,
      serial: "NL-CAR-001",
      manufacturer_serial: "VENDOR-909",
      brand: "اختبار",
      warranty_end: "2028-01-01",
      location: "ساحة الضيافة",
      site_location: geo,
    };
    let r = await a.req("assets/save", payload);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const id = r.data.id;
    let s = await state(a),
      asset = s.assets.find((x) => x.id === id);
    assert.match(asset.serial, /^NL-\d{8}$/);
    payload.serial = asset.serial;
    assert.equal(asset.meta.site_location.lat, 24.7136);
    assert.equal(asset.meta.manufacturer_serial, "VENDOR-909");
    const outsider = await state(a, a.outsider);
    assert.ok(!outsider.assets.some((x) => x.id === id));
    r = await a.req("assets/save", {
      ...payload,
      id,
      version: asset.version,
      site_location: { ...geo, lat: 91 },
    });
    assert.equal(r.status, 400);
    r = await a.req("assets/save", {
      ...payload,
      id,
      version: asset.version,
      site_location: { ...geo, lng: "" },
    });
    assert.equal(r.status, 400);
    r = await a.req("assets/save", {
      ...payload,
      id,
      version: asset.version,
      site_location: null,
    });
    assert.equal(r.status, 200);
    s = await state(a);
    assert.equal(s.assets.find((x) => x.id === id).meta.site_location, null);
    const tid = await saveTask(a, { meta: { site_location: geo } });
    s = await state(a, a.member);
    assert.equal(
      s.tasks.find((x) => x.id === tid).meta.site_location.label,
      geo.label,
    );
    const p = (await state(a)).projects.find((p) => p.id === a.pid);
    r = await a.req("projects/save", {
      ...p,
      budget: p.budget / 100,
      site_location: geo,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(
      (await state(a)).projects.find((p) => p.id === a.pid).meta.site_location
        .lng,
      46.6753,
    );
  } finally {
    a.DB.close();
  }
});
