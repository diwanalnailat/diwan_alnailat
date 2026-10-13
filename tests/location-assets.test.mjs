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
      map_url:
        "https://www.google.com/maps/search/?api=1&query=24.7136,46.6753",
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
    assert.equal(asset.meta.site_location.map_url, geo.map_url);
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
    assert.equal(
      (await state(a, a.member)).projects.find((p) => p.id === a.pid).meta
        .site_location.map_url,
      geo.map_url,
    );
    assert.ok(
      !(await state(a, a.outsider)).projects.some((p) => p.id === a.pid),
    );
    const result = await a.req(
      "location/resolve",
      { url: geo.map_url },
      a.member,
    );
    assert.equal(result.status, 200);
    assert.equal(result.data.lat, 24.7136);
    const memberRow = await a.DB.prepare(
      "SELECT grants FROM nl_members WHERE id=?",
    )
      .bind(a.member.memberId)
      .first();
    await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
      .bind(
        JSON.stringify([
          ...JSON.parse(memberRow.grants),
          {
            resource: "projects",
            action: "view",
            effect: "deny",
            scope: "project",
            projectId: a.pid,
          },
        ]),
        a.member.memberId,
      )
      .run();
    assert.equal(
      (await state(a, a.member)).projects.find((p) => p.id === a.pid).meta
        .site_location,
      null,
      "explicit project denial still hides its location",
    );
    assert.equal(
      (await a.req("location/resolve", { url: geo.map_url }, null)).status,
      401,
    );
  } finally {
    a.DB.close();
  }
});
