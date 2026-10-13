import test from "node:test";
import assert from "node:assert/strict";
import { maintenanceCron } from "../lib/maintenance-cron.js";
import { maintain, readiness } from "../lib/operations.js";
import { app } from "./support.mjs";
import { GET, HEAD } from "../app/api/cron/maintenance/route.js";

const secret = "synthetic-maintenance-credential-0123456789";
const request = (authorization, method = "GET") =>
  new Request("https://diwan.test/api/cron/maintenance", {
    method,
    headers: authorization ? { authorization } : {},
  });

test("cron rejects missing, malformed and forged credentials before any job", async () => {
  let calls = 0;
  const run = async () => {
    calls++;
    return {};
  };
  for (const header of [
    undefined,
    "Bearer undefined",
    "Bearer wrong",
    secret,
    `Basic ${secret}`,
    `Bearer ${secret}x`,
  ]) {
    const response = await maintenanceCron(request(header), secret, run);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const config of [undefined, "", "short"])
    assert.equal(
      (await maintenanceCron(request(`Bearer ${config}`), config, run)).status,
      401,
    );
  for (const method of ["HEAD", "POST"])
    assert.equal(
      (await maintenanceCron(request(`Bearer ${secret}`, method), secret, run))
        .status,
      405,
    );
  assert.equal(calls, 0);
});

test("Next cron route rejects public probes without loading server jobs", async () => {
  assert.equal((await GET(request())).status, 401);
  assert.equal((await HEAD(request(undefined, "HEAD"))).status, 405);
});

test("authorized cron runs maintenance, honors duplicate lease and hides failures", async () => {
  const a = await app();
  const run = () => maintain(a.env);
  const first = await maintenanceCron(request(`Bearer ${secret}`), secret, run);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).ok, true);
  assert.ok(
    await a.DB.prepare(
      "SELECT value FROM nl_settings WHERE key='maintenance:last'",
    ).first(),
  );
  const duplicate = await maintenanceCron(
    request(`Bearer ${secret}`),
    secret,
    run,
  );
  assert.equal((await duplicate.json()).skipped, true);
  const failure = await maintenanceCron(
    request(`Bearer ${secret}`),
    secret,
    async () => {
      throw new Error("secret/private-row");
    },
  );
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: "Maintenance failed" });
});

test("readiness distinguishes Vercel sessions and configured cron without claiming execution", async () => {
  const a = await app();
  const context = { committees: [], settings: {} };
  const result = await readiness(
    { ...a.env, DIWAN_RUNTIME: "vercel_whatsapp", CRON_SECRET: secret },
    context,
  );
  assert.equal(result.maintenance, null);
  assert.ok(result.external_gates.some((x) => x.includes("جلسات الديوان")));
  assert.ok(result.external_gates.some((x) => x.includes("راجع آخر نجاح")));
  assert.ok(
    result.external_gates.every((x) => !x.includes("مرتبط بدخول Sites")),
  );
});
