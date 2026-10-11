import test from "node:test";
import assert from "node:assert/strict";
import { app, addMember, full } from "./support.mjs";
import { validateHeritageSeasons } from "../lib/heritage-results.js";

const season = {
  edition: "11",
  season: "2026–2027",
  title: "موسم اختبار",
  awards: [
    {
      rank: 1,
      title: "شوط الاختبار",
      date: "2027-01-01",
      camel: "مطية اختبار",
    },
  ],
};
test("heritage administration enforces permissions, versions, safe public projection and explicit empty publication", async () => {
  const a = await app();
  const publicInitial = await a.req("heritage-results", undefined, null);
  assert.equal(publicInitial.status, 200);
  assert.equal(publicInitial.data.seasons.length, 5);
  assert.deepEqual(Object.keys(publicInitial.data), ["seasons"]);
  assert.equal(
    (await a.req("heritage-results/manage", undefined, null)).status,
    401,
  );
  const initial = await a.req("heritage-results/manage");
  const outsider = await addMember(a, "heritage-outsider", []);
  const denied = await addMember(a, "heritage-denied", [
    ...full,
    { resource: "settings", action: "manage", effect: "deny", scope: "all" },
  ]);
  const expired = await addMember(a, "heritage-expired", [
    {
      resource: "settings",
      action: "manage",
      effect: "allow",
      scope: "all",
      expires: "2000-01-01T00:00:00Z",
    },
  ]);
  for (const user of [outsider, denied, expired]) {
    assert.equal(
      (await a.req("heritage-results/manage", undefined, user)).status,
      403,
    );
    assert.equal(
      (
        await a.req(
          "heritage-results/save",
          { version: 0, seasons: [season] },
          user,
        )
      ).status,
      403,
    );
    assert.equal(
      (await a.req("state?view=heritage_results", undefined, user)).data
        .heritage_results_access,
      false,
    );
  }
  assert.equal(
    (
      await a.req(
        "heritage-results/save",
        { version: 0, seasons: [season] },
        undefined,
        { origin: "https://other.test" },
      )
    ).status,
    403,
  );
  const input = {
    ...season,
    privateNote: "never expose",
    awards: [{ ...season.awards[0], internal: "never expose" }],
  };
  assert.equal(
    (
      await a.req("heritage-results/save", {
        version: initial.data.version,
        seasons: [input],
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await a.req("heritage-results", undefined, null)).data.seasons,
    [season],
  );
  assert.equal(
    (await a.req("heritage-results/save", { version: 0, seasons: [] })).status,
    409,
  );
  assert.equal(
    (
      await a.req("heritage-results/save", {
        version: 1,
        seasons: [season, season],
      })
    ).status,
    400,
  );
  assert.equal(
    (await a.req("heritage-results/save", { version: 1, seasons: [] })).status,
    200,
  );
  assert.deepEqual(
    (await a.req("heritage-results", undefined, null)).data.seasons,
    [],
  );
  assert.equal((await a.req("heritage-results/manage")).data.version, 2);
  assert.equal(
    (await a.req("state?view=heritage_results")).data.heritage_results_access,
    true,
  );
  const audit = await a.DB.prepare(
    "SELECT count(*) AS n FROM nl_audit WHERE entity_id='heritage_results'",
  ).first();
  assert.equal(Number(audit.n), 2);
  // The SQLite test adapter has one connection and cannot overlap transactions.
  // PostgreSQL exercises the actual concurrent transaction/row-guard behavior.
  if (process.env.DIWAN_TEST_DATABASE !== "postgres") return;
  const race = await Promise.all([
    a.req("heritage-results/save", { version: 2, seasons: [season] }),
    a.req("heritage-results/save", {
      version: 2,
      seasons: [{ ...season, title: "تعديل متزامن" }],
    }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await a.req("heritage-results/manage")).data.version, 3);
});

test("heritage input is bounded and rejects invalid calendar dates, ranks and duplicate editions", () => {
  for (const awards of [
    [{ rank: 0, title: "x" }],
    [{ rank: 1.5, title: "x" }],
    [{ rank: 1, title: "x", date: "2026-02-30" }],
    [{ rank: 1, title: "" }],
  ])
    assert.throws(() => validateHeritageSeasons([{ ...season, awards }]));
  for (const value of [
    null,
    Array(51).fill(season),
    [{ ...season, edition: "01" }],
    [{ ...season, awards: Array(101).fill(season.awards[0]) }],
  ])
    assert.throws(() => validateHeritageSeasons(value));
  assert.deepEqual(
    validateHeritageSeasons([{ ...season, awards: [] }])[0].awards,
    [],
  );
});
