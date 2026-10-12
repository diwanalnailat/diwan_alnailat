import test from "node:test";
import assert from "node:assert/strict";
import {
  googleMapsUrl,
  googleMapsPoint,
  resolveGoogleMaps,
} from "../lib/google-maps.js";
import { validateLocation } from "../lib/location.js";

test("Google Maps pin parsing and location validation preserve the original link", async () => {
  const link =
    "https://www.google.com/maps/place/Example/@20,30,12z/data=!3d24.7136!4d46.6753";
  const expected = { lat: 24.7136, lng: 46.6753 };
  for (const url of [
    link,
    "https://maps.google.com/?q=24.7136,46.6753",
    "https://www.google.com/maps/search/?api=1&query=24.7136%2C46.6753",
    "https://www.google.com/maps/search/24.7136,+46.6753?entry=tts",
    "https://www.google.com/maps/search/24.7136%2C%2046.6753/",
    "https://www.google.com/maps/dir/?api=1&destination=24.7136,46.6753",
    "https://www.google.com/maps/@24.7136,46.6753,16z",
  ])
    assert.deepEqual(googleMapsPoint(url), expected);
  assert.equal(
    googleMapsPoint("https://www.google.com/maps/place/Unknown/@20,30,12z"),
    null,
    "camera center is not the place pin",
  );
  assert.deepEqual(
    await resolveGoogleMaps(link, () => assert.fail("no network needed")),
    { ...expected, map_url: link },
  );
  assert.equal(validateLocation({ ...expected, map_url: link }).map_url, link);
  assert.throws(
    () => validateLocation({ ...expected, lat: 20, map_url: link }),
    { status: 400 },
  );
  assert.throws(() => validateLocation({ map_url: link }), { status: 400 });
  assert.throws(() => googleMapsPoint("https://maps.google.com/?q=91,10"), {
    status: 400,
  });
  for (const url of [
    "javascript:alert(1)",
    "https://127.0.0.1/maps",
    "https://www.google.com.evil.test/maps",
    "https://user@www.google.com/maps",
    "https://maps.app.goo.gl:8443/Abc",
    "http://maps.google.com/?q=0,0",
    "https://www.google.com/url?q=https://127.0.0.1",
    "https://evil.test/?url=https://maps.google.com/",
    "https://maps.app.goo.gl\\@evil.test/Abc",
  ])
    assert.throws(() => googleMapsUrl(url), { status: 400 });
});

test("short Google Maps URLs follow only bounded trusted redirects and do not fetch arbitrary hosts", async () => {
  const short = "https://maps.app.goo.gl/Abcd1234";
  const calls = [];
  const resolved = await resolveGoogleMaps(short, async (url, opts) => {
    calls.push(url);
    assert.equal(opts.redirect, "manual");
    assert.ok(opts.signal);
    return new Response(null, {
      status: 302,
      headers: {
        location: "https://www.google.com/maps/place/Test/data=!3d24.7!4d46.6",
      },
    });
  });
  assert.deepEqual(resolved, { lat: 24.7, lng: 46.6, map_url: short });
  assert.equal(calls.length, 1);
  assert.deepEqual(
    await resolveGoogleMaps(
      short,
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            location:
              "https://www.google.com/maps/search/-24.7,+-46.6?entry=tts",
          },
        }),
    ),
    { lat: -24.7, lng: -46.6, map_url: short },
  );
  let attempts = 0;
  await assert.rejects(
    resolveGoogleMaps(short, async () => {
      attempts++;
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      });
    }),
    { status: 400 },
  );
  assert.equal(attempts, 1);
  await assert.rejects(
    resolveGoogleMaps(
      short,
      async () =>
        new Response(null, { status: 302, headers: { location: short } }),
    ),
    { status: 400 },
  );
  await assert.rejects(
    resolveGoogleMaps(short, async () => new Response("No location")),
    { status: 422 },
  );
  await assert.rejects(
    resolveGoogleMaps(short, async () => {
      throw new Error("timeout");
    }),
    { status: 502 },
  );
});
