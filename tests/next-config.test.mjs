import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants.js";
import config from "../next.config.mjs";

test("Next production never forwards requests to the local developer identity", async () => {
  for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER]) {
    assert.deepEqual(await config(phase).rewrites(), { beforeFiles: [] });
  }
});

test("Next development preserves workspace and API access on fixed loopback destinations", async () => {
  const { beforeFiles } = await config(PHASE_DEVELOPMENT_SERVER).rewrites();
  assert.deepEqual(
    beforeFiles.map((route) => route.source),
    ["/workspace", "/api/:path*"],
  );
  for (const route of beforeFiles) {
    const destination = new URL(route.destination);
    assert.equal(destination.origin, "http://127.0.0.1:4174");
  }
});
