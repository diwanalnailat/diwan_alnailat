import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import {
  fixture,
  saveExpense,
  review,
  owner,
  addMember,
  full,
  upload,
} from "./support.mjs";

const grant = (resource, action, extra = {}) => ({
  resource,
  action,
  effect: "allow",
  scope: "all",
  ...extra,
});
const ok = (result) =>
  assert.equal(result.status, 200, JSON.stringify(result.data));
const setGrants = (a, actor, grants) =>
  a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
    .bind(JSON.stringify(grants), actor.memberId)
    .run();
async function fileRead(a, actor, id) {
  return worker.fetch(
    new Request(`https://diwan.test/api/files/${id}`, {
      headers: {
        "oai-authenticated-user-id": actor.id,
        "oai-authenticated-user-email": actor.email,
      },
    }),
    a.env,
  );
}

test("financial field denial also redacts exports, payment sidecars and invoice downloads", async () => {
  const a = await fixture();
  try {
    const eid = await saveExpense(a);
    ok(await review(a, eid, a.manager));
    ok(await review(a, eid, owner));
    const proof = await upload(a, "expenses", "reimbursement", owner, {
      entity: eid,
      attach_later: "true",
    });
    ok(
      await a.req("expenses/pay", {
        id: eid,
        amount: "115.50",
        date: "2027-01-11",
        reference: "synthetic-audit-receipt",
        files: [proof],
      }),
    );
    const observer = await addMember(a, "financial-boundary-observer", full);
    let result = await a.req(
      `export?type=expenses&project=${a.pid}`,
      undefined,
      observer,
    );
    ok(result);
    assert.equal(result.data.rows.find((row) => row.id === eid).amount, 11550);
    assert.equal(result.data.payments.length, 1);
    await setGrants(a, observer, [
      ...full,
      grant("expenses.amount", "view", { effect: "deny" }),
    ]);
    result = await a.req(
      `export?type=expenses&project=${a.pid}`,
      undefined,
      observer,
    );
    ok(result);
    const expense = result.data.rows.find((row) => row.id === eid);
    assert.equal(expense.amount_hidden, true);
    for (const field of ["amount", "tax", "paid"])
      assert.equal(expense[field], undefined, field);
    assert.deepEqual(result.data.payments, []);
    assert.equal((await fileRead(a, observer, proof)).status, 403);
    await setGrants(a, observer, [
      ...full,
      grant("expenses", "export", { effect: "deny" }),
    ]);
    assert.equal(
      (
        await a.req(
          `export?type=expenses&project=${a.pid}`,
          undefined,
          observer,
        )
      ).status,
      403,
    );
  } finally {
    if (process.env.DIWAN_TEST_DATABASE !== "postgres") await a.DB.close();
  }
});

test("expired record permissions revoke attached files and exports while active grants remain usable", async () => {
  const a = await fixture();
  try {
    const eid = await saveExpense(a);
    const file = await a.DB.prepare(
      "SELECT id FROM nl_files WHERE entity_type='expenses' AND entity_id=?",
    )
      .bind(eid)
      .first();
    const permissions = [
      grant("expenses", "view"),
      grant("expenses", "download"),
      grant("expenses", "export"),
      grant("reports", "export"),
    ];
    const observer = await addMember(
      a,
      "temporary-financial-observer",
      permissions,
    );
    assert.equal((await fileRead(a, observer, file.id)).status, 200);
    ok(
      await a.req(`export?type=expenses&project=${a.pid}`, undefined, observer),
    );
    await setGrants(
      a,
      observer,
      permissions.map((entry) => ({
        ...entry,
        expires: "2000-01-01T00:00:00.000Z",
      })),
    );
    assert.equal((await fileRead(a, observer, file.id)).status, 403);
    assert.equal(
      (
        await a.req(
          `export?type=expenses&project=${a.pid}`,
          undefined,
          observer,
        )
      ).status,
      403,
    );
    const state = await a.req("state?view=expenses", undefined, observer);
    ok(state);
    assert.deepEqual(state.data.expenses, []);
    assert.deepEqual(state.data.payments, []);
  } finally {
    if (process.env.DIWAN_TEST_DATABASE !== "postgres") await a.DB.close();
  }
});
