import test from "node:test";
import assert from "node:assert/strict";
import { fixture, state } from "./support.mjs";

test("project Google Maps links require authentication and preserve validated coordinates", async () => {
  const a = await fixture();
  try {
    const url = "https://maps.google.com/?q=24.7136,46.6753";
    assert.equal((await a.req("location/resolve", { url }, null)).status, 401);
    assert.equal((await a.req("location/resolve", { url: "https://127.0.0.1/private" })).status, 400);
    const resolved = await a.req("location/resolve", { url });
    assert.equal(resolved.status, 200);
    const p = (await state(a)).projects.find((p) => p.id === a.pid);
    const payload = { ...p, budget: p.budget / 100, site_location: resolved.data };
    assert.equal((await a.req("projects/save", payload, a.outsider)).status, 403);
    assert.equal((await a.req("projects/save", { ...payload, site_location: { ...resolved.data, lat: 20 } })).status, 400);
    const saved = await a.req("projects/save", payload);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const location = (await state(a)).projects.find((p) => p.id === a.pid).meta.site_location;
    assert.equal(location.lat, 24.7136);
    assert.equal(location.lng, 46.6753);
    assert.equal(location.map_url, url);
  } finally {
    a.DB.close();
  }
});
