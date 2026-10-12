import test from "node:test";
import assert from "node:assert/strict";
import { fixture, owner, upload, review, state, addMember } from "./support.mjs";

process.env.DIWAN_TEST_DATABASE = "postgres";
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.data));
const record = (a, table, id) => a.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
const expenseState = async (a, id) => (await state(a)).expenses.find((e) => e.id === id);
const body = (a, extra = {}) => ({ project_id: a.pid, committee_id: a.cid,
  title: "تجهيز الموقع", amount: "115.50", date: "2027-01-10", funding_source: "personal", status: "pending", ...extra });
async function withoutLines() {
  const a = await fixture();
  const original = await record(a, "nl_committees", a.cid);
  const created = await a.req("committees/save", { project_id: a.pid, name: "لجنة بلا بنود صرف",
    manager_id: a.manager.memberId, second_approver_id: "owner", members: JSON.parse(original.members) });
  ok(created); a.cid = created.data.id;
  assert.deepEqual(JSON.parse((await record(a, "nl_committees", a.cid)).config).budgetLines || [], []);
  return a;
}
const invoice = (a, as = a.member) => upload(a, "expenses", "invoice", as, { project: a.pid, committee: a.cid });

test("expenses work without budget lines from draft through two approvals and guarded reimbursement", async () => {
  const a = await withoutLines();
  let saved = await a.req("expenses/save", body(a, { status: "draft", budget_line_id: "stale-client-value", category: "تصنيف مزور" }), a.member);
  ok(saved);
  const id = saved.data.id;
  let e = await record(a, "nl_expenses", id);
  assert.equal(e.amount, 11550); assert.equal(e.tax, 0); assert.equal(e.category, "");
  assert.equal(JSON.parse(e.meta).budget_line_id, undefined);
  assert.equal(JSON.parse(e.meta).budget_line_name, undefined);
  const proof = await invoice(a);
  saved = await a.req("expenses/save", body(a, { id, version: e.version, files: [proof] }), a.member); ok(saved);
  e = await record(a, "nl_expenses", id);
  assert.equal(e.status, "pending"); assert.deepEqual(JSON.parse(e.meta).route, [a.manager.memberId, "owner"]);
  assert.equal((await review(a, id, owner)).status, 403);
  ok(await review(a, id, a.manager));
  assert.equal((await expenseState(a, id)).paid, 0);
  assert.equal((await review(a, id, a.manager)).status, 403);
  ok(await review(a, id, owner));
  e = await expenseState(a, id); assert.equal(e.status, "approved"); assert.equal(e.paid, 0);
  const receipt = await upload(a, "expenses", "reimbursement", owner, { entity: id, attach_later: "true" });
  const pay = { id, amount: "115.50", date: "2027-01-11", reference: "SIMPLE-PAID", files: [receipt] };
  ok(await a.req("expenses/pay", pay, owner, { key: "simple-reimburse" }));
  ok(await a.req("expenses/pay", pay, owner, { key: "simple-reimburse" }));
  assert.equal((await expenseState(a, id)).paid, 11550);
  assert.equal((await a.DB.prepare("SELECT count(*) AS n FROM nl_payments WHERE expense_id=?").bind(id).first()).n, 1);
  const extra = await upload(a, "expenses", "reimbursement", owner, { entity: id, attach_later: "true" });
  assert.equal((await a.req("expenses/pay", { ...pay, amount: "0.01", files: [extra] })).status, 409);
  assert.equal((await expenseState(a, id)).paid, 11550);
});

test("no classification setup never bypasses required proof, money validation, permissions or expense conflicts", async () => {
  const a = await withoutLines();
  assert.equal((await a.req("expenses/save", body(a), a.member)).status, 400);
  for (const invalid of [{ amount: "0" }, { amount: "-1" }, { amount: "1.001" }, { amount: "NaN" }, { title: "" }, { date: "invalid" }])
    assert.equal((await a.req("expenses/save", body(a, { status: "draft", ...invalid }), a.member)).status, 400, JSON.stringify(invalid));
  assert.equal((await a.req("expenses/save", body(a, { status: "draft" }), a.outsider)).status, 403);
  await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?").bind(JSON.stringify([
    { resource: "expenses", action: "create", effect: "deny", scope: "all" },
  ]), a.member.memberId).run();
  assert.equal((await a.req("expenses/save", body(a, { status: "draft" }), a.member)).status, 403);
  const delegate = await addMember(a, "simple-finance-delegate");
  const committee = await record(a, "nl_committees", a.cid);
  ok(await a.req("committees/save", { id: committee.id, project_id: a.pid, name: committee.name, version: committee.version,
    review_delegate_id: delegate.memberId }));
  const proof = await invoice(a, a.manager);
  const saved = await a.req("expenses/save", body(a, { files: [proof] }), a.manager); ok(saved);
  const e = await record(a, "nl_expenses", saved.data.id);
  assert.deepEqual(JSON.parse(e.meta).route, [delegate.memberId, "owner"]);
  assert.equal((await review(a, e.id, a.manager)).status, 403, "creator/claimant cannot approve their own expense");
  assert.equal((await review(a, e.id, owner)).status, 403);
  ok(await review(a, e.id, delegate)); ok(await review(a, e.id, owner));
});

test("omitting committee budget configuration and editing historical expenses preserves all classification history", async () => {
  const a = await fixture(), committee = await record(a, "nl_committees", a.cid);
  const historicalConfig = JSON.parse(committee.config);
  ok(await a.req("committees/save", { id: committee.id, project_id: a.pid, name: committee.name, version: committee.version,
    config: { tags: ["تصنيف تشغيل آخر"] } }));
  const merged = JSON.parse((await record(a, "nl_committees", a.cid)).config);
  assert.deepEqual(merged.budgetLines, historicalConfig.budgetLines);
  assert.equal(merged.second_approver_id, historicalConfig.second_approver_id);
  const saved = await a.req("expenses/save", body(a, { status: "draft" }), a.member); ok(saved);
  const old = await record(a, "nl_expenses", saved.data.id), history = { ...JSON.parse(old.meta),
    budget_line_id: "archived-line", budget_line_name: "بند قديم محفوظ", archivalNote: "keep historical metadata" };
  await a.DB.prepare("UPDATE nl_expenses SET meta=?,category=? WHERE id=?").bind(JSON.stringify(history), "تصنيف تاريخي", old.id).run();
  ok(await a.req("expenses/save", body(a, { id: old.id, version: old.version, status: "draft", amount: "99.99",
    budget_line_id: "forged-id", budget_line_name: "forged name", category: "forged category",
    meta: { budget_line_id: "nested-forged-id", budget_line_name: "nested forged" } }), a.member));
  const edited = await record(a, "nl_expenses", old.id), meta = JSON.parse(edited.meta);
  assert.equal(edited.amount, 9999); assert.equal(edited.category, "تصنيف تاريخي");
  assert.equal(meta.budget_line_id, history.budget_line_id); assert.equal(meta.budget_line_name, history.budget_line_name);
  assert.equal(meta.archivalNote, history.archivalNote);
  assert.deepEqual(JSON.parse((await record(a, "nl_committees", a.cid)).config).budgetLines, historicalConfig.budgetLines);
});

test("unclassified advance expenses settle only after both approvals and cannot overdraw", async () => {
  const a = await withoutLines();
  const proof = await upload(a, "advances", "handover", owner, { project: a.pid, committee: a.cid });
  const funded = await a.req("advances/create", { project_id: a.pid, committee_id: a.cid, assignee_id: a.member.memberId,
    title: "عهدة تشغيل", purpose: "تجهيز الموقع", amount: "50.00", date: "2027-01-01", reference: "SIMPLE-FUND", files: [proof] }); ok(funded);
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const file = await invoice(a);
    const saved = await a.req("expenses/save", body(a, { title: "مصروف عهدة " + i, amount: "30.00", funding_source: "advance",
      advance_id: funded.data.id, files: [file] }), a.member); ok(saved); ids.push(saved.data.id);
    ok(await review(a, saved.data.id, a.manager));
  }
  let snapshot = await state(a, a.member);
  assert.equal(snapshot.advances.find((x) => x.id === funded.data.id).balance, 5000);
  ok(await review(a, ids[0], owner));
  assert.equal((await review(a, ids[1], owner)).status, 409);
  snapshot = await state(a, a.member);
  assert.equal(snapshot.advances.find((x) => x.id === funded.data.id).balance, 2000);
  assert.equal(snapshot.expenses.find((x) => x.id === ids[0]).paid, 3000);
  assert.equal(snapshot.expenses.find((x) => x.id === ids[1]).status, "pending");
  assert.equal(snapshot.expenses.find((x) => x.id === ids[1]).paid, 0);
});
