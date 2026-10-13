import test from "node:test";
import assert from "node:assert/strict";
import { fixture, saveTask, saveExpense, review, upload, state, owner, addMember } from "./support.mjs";

const ok = (result) => assert.equal(result.status, 200, JSON.stringify(result.data));
const row = (a, table, id) => a.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
const approval = (a, id) => a.DB.prepare("SELECT * FROM nl_task_approvals WHERE task_id=?").bind(id).first();
const grant = (resource, action, effect = "allow", extra = {}) => ({ resource, action, effect, scope: "all", ...extra });
const setGrants = (a, person, grants) => a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?").bind(JSON.stringify(grants), person.memberId).run();
async function decision(a, id, action, extra = {}, as = owner, opts = {}) {
  const current = await approval(a, id);
  return a.req("task-approvals/decide", { id, version: current.version, action, note: `Reason for ${action}`, ...extra }, as, opts);
}
async function submit(a, id) {
  let task = await row(a, "nl_tasks", id);
  ok(await a.req("tasks/transition", { id, version: task.version, status: "doing" }, a.member));
  task = await row(a, "nl_tasks", id);
  for (const step of JSON.parse(task.meta).checklist) {
    ok(await a.req("tasks/checklist", { id, item_id: step.id, done: true, version: task.version }, a.member));
    task = await row(a, "nl_tasks", id);
  }
  ok(await a.req("tasks/transition", { id, version: task.version, status: "review", note: "Execution completed with all checklist evidence" }, a.member));
  return row(a, "nl_tasks", id);
}
async function complete(a, extra = {}, reviewer = a.manager) {
  const id = await saveTask(a, extra), task = await submit(a, id);
  ok(await a.req("tasks/transition", { id, version: task.version, status: "done", note: "Inspected and accepted execution" }, reviewer));
  return id;
}
async function addReviewerMembership(a) {
  const committee = await row(a, "nl_committees", a.cid);
  await a.DB.prepare("UPDATE nl_committees SET members=? WHERE id=?").bind(JSON.stringify([
    ...JSON.parse(committee.members), { id: a.outsider.memberId, role: "member", grants: [] },
  ]), a.cid).run();
}
async function usingFixture(run) {
  const a = await fixture();
  try { await run(a); } finally { if (process.env.DIWAN_TEST_DATABASE !== "postgres") await a.DB.close(); }
}

for (const database of ["sqlite", "postgres"]) {
  test(`task administration workflow (${database})`, async (t) => {
    process.env.DIWAN_TEST_DATABASE = database;
    await t.test("selected reviewer replaces the default, has record access without edit, and explicit denial wins", () => usingFixture(async (a) => {
      const defaultId = await saveTask(a);
      assert.equal(JSON.parse((await row(a, "nl_tasks", defaultId)).meta).reviewer_id, a.manager.memberId);
      await addReviewerMembership(a);
      await setGrants(a, a.outsider, [grant("tasks", "edit", "deny")]);
      const id = await saveTask(a, { meta: { reviewer_id: a.outsider.memberId } });
      const task = await submit(a, id);
      assert.ok((await state(a, a.outsider)).tasks.some((item) => item.id === id), "selected reviewer can find the task");
      assert.equal((await a.req("tasks/transition", { id, version: task.version, status: "done" }, a.manager)).status, 403);
      await setGrants(a, a.outsider, [grant("tasks", "edit", "deny"), grant("tasks", "approve", "deny")]);
      assert.equal((await a.req("tasks/transition", { id, version: task.version, status: "done" }, a.outsider)).status, 403);
      assert.equal((await approval(a, id)) ?? null, null);
      assert.equal((await row(a, "nl_tasks", id)).status, "review");
      await setGrants(a, a.outsider, [grant("tasks", "edit", "deny")]);
      ok(await a.req("tasks/transition", { id, version: task.version, status: "done", note: "Independent reviewer verified completion" }, a.outsider));
      const entry = await approval(a, id), snapshot = JSON.parse(entry.snapshot);
      assert.equal(entry.status, "pending");
      assert.equal(snapshot.reviewer_id, a.outsider.memberId);
      assert.equal(snapshot.assignee_id, a.member.memberId);
      assert.equal(snapshot.approval_note, "Independent reviewer verified completion");
      assert.equal(snapshot.completion_note, "Execution completed with all checklist evidence");
      assert.ok(snapshot.checklist.every((step) => step.done));
      assert.equal((await row(a, "nl_tasks", id)).status, "done");
      assert.equal((await a.req("task-approvals/decide", { id, version: entry.version, action: "approve", note: "No admin grant" }, a.outsider)).status, 403);
    }));

    await t.test("review delegation expires and committee removal revokes reviewer record access", () => usingFixture(async (a) => {
      await addReviewerMembership(a);
      const expiry = new Date(Date.now() + 120_000).toISOString();
      const assigner = await addMember(a, "temporary-assigner", [
        grant("tasks", "create"), grant("tasks", "view"),
        grant("tasks", "assign", "allow", { expires: expiry }),
        grant("tasks", "approve", "allow", { expires: expiry }),
      ]);
      const saved = await a.req("tasks/save", {
        project_id: a.pid, title: "Time-bound reviewer delegation", description: "Temporary delegated task",
        assignee_id: a.member.memberId, priority: "normal", status: "todo", due: "2027-01-20",
        meta: { committee_id: a.cid, type: "execution", reviewer_id: a.outsider.memberId },
      }, assigner); ok(saved);
      const id = saved.data.id;
      assert.equal(JSON.parse((await row(a, "nl_tasks", id)).meta).reviewer_expires, expiry);
      const task = await submit(a, id);
      const committee = await row(a, "nl_committees", a.cid);
      await a.DB.prepare("UPDATE nl_committees SET members=? WHERE id=?").bind(JSON.stringify(
        JSON.parse(committee.members).filter((person) => person.id !== a.outsider.memberId),
      ), a.cid).run();
      assert.equal((await a.req("tasks/transition", { id, version: task.version, status: "done" }, a.outsider)).status, 403);
      assert.ok(!(await state(a, a.outsider)).tasks.some((item) => item.id === id));
      await a.DB.prepare("UPDATE nl_committees SET members=? WHERE id=?").bind(committee.members, a.cid).run();
      const meta = { ...JSON.parse(task.meta), reviewer_expires: "2000-01-01T00:00:00.000Z" };
      await a.DB.prepare("UPDATE nl_tasks SET meta=? WHERE id=?").bind(JSON.stringify(meta), id).run();
      assert.equal((await a.req("tasks/transition", { id, version: task.version, status: "done" }, a.outsider)).status, 403);
      assert.ok(!(await state(a, a.outsider)).tasks.some((item) => item.id === id));
      assert.equal((await approval(a, id)) ?? null, null);
    }));

    await t.test("administrative actions are independent, versioned, audited, and idempotent", () => usingFixture(async (a) => {
      const id = await complete(a, { meta: { collaborators: [a.manager.memberId] } });
      const execution = await row(a, "nl_tasks", id);
      for (const note of [undefined, "", "   "]) {
        assert.equal((await decision(a, id, "approve", { note })).status, 400);
      }
      for (const version of [undefined, 0, -1, 1.5, "1"]) {
        assert.equal((await decision(a, id, "approve", { version })).status, 400);
      }
      for (const [action, expected] of [["approve", "approved"], ["hold", "on_hold"], ["refer_finance", "finance"], ["request_info", "clarification"], ["stop_payment", "clarification"], ["resume_payment", "clarification"]]) {
        const before = await approval(a, id), key = `task-admin-${database}-${action}`;
        const first = await decision(a, id, action, {}, owner, { key }); ok(first);
        const replay = await decision(a, id, action, { version: before.version }, owner, { key }); ok(replay);
        assert.deepEqual(replay.data, first.data);
        const after = await approval(a, id);
        assert.equal(after.status, expected);
        assert.equal(after.version, before.version + 1, "replay cannot apply twice");
        assert.equal(after.payment_hold, action === "stop_payment" ? 1 : 0);
        assert.deepEqual(await row(a, "nl_tasks", id), execution, "administration never changes execution, metadata, or version");
        assert.equal((await decision(a, id, action, { version: before.version })).status, 409, "stale action cannot mutate");
        assert.equal((await decision(a, id, action, { version: before.version, note: "Different request" }, owner, { key })).status, 409);
        const audit = await a.DB.prepare("SELECT count(*) AS n FROM nl_audit WHERE resource='task_approvals' AND entity_id=? AND action=?").bind(id, action).first();
        assert.equal(audit.n, 1);
      }
      const detail = await a.req(`task-approvals/detail?id=${id}`); ok(detail);
      assert.equal(detail.data.execution_status, "done");
      assert.equal(detail.data.history.length, 6);
      assert.equal(detail.data.snapshot.approval_note, "Inspected and accepted execution");
      assert.ok(detail.data.people.some((person) => person.id === a.member.memberId));
      assert.ok(detail.data.people.every((person) => Object.keys(person).every((key) => ["id", "name"].includes(key))));
      const beforeRace = await approval(a, id);
      const race = await Promise.all([
        decision(a, id, "approve", { version: beforeRace.version }),
        decision(a, id, "hold", { version: beforeRace.version }),
      ]);
      assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
      assert.equal((await approval(a, id)).version, beforeRace.version + 1);
      assert.deepEqual(await row(a, "nl_tasks", id), execution);
    }));

    await t.test("resubmitted completion refreshes the approval snapshot while retaining a payment hold", () => usingFixture(async (a) => {
      const id = await complete(a);
      ok(await decision(a, id, "approve")); ok(await decision(a, id, "stop_payment"));
      const previous = await approval(a, id);
      let task = await row(a, "nl_tasks", id);
      ok(await a.req("tasks/transition", { id, version: task.version, status: "doing", note: "Additional execution requested" }, a.manager));
      task = await row(a, "nl_tasks", id);
      ok(await a.req("tasks/transition", { id, version: task.version, status: "review", note: "Additional execution completed" }, a.member));
      task = await row(a, "nl_tasks", id);
      ok(await a.req("tasks/transition", { id, version: task.version, status: "done", note: "Second completion reviewed" }, a.manager));
      const current = await approval(a, id);
      assert.equal(current.status, "pending"); assert.equal(current.payment_hold, 1);
      assert.equal(current.version, previous.version + 1);
      assert.equal(JSON.parse(current.snapshot).approval_note, "Second completion reviewed");
      assert.equal(JSON.parse(current.snapshot).completion_note, "Additional execution completed");
      assert.equal((await row(a, "nl_tasks", id)).status, "done");
    }));

    await t.test("list/detail respect record denial and expense amount redaction", () => usingFixture(async (a) => {
      const id = await complete(a), eid = await saveExpense(a, { task_id: id });
      const observer = await addMember(a, "approval-observer");
      const full = [grant("*", "*")];
      let detail = await a.req(`task-approvals/detail?id=${id}`, undefined, observer); ok(detail);
      assert.equal(detail.data.cost, 11550);
      assert.equal(detail.data.expenses.find((e) => e.id === eid).amount, 11550);
      await setGrants(a, observer, [...full, grant("expenses.amount", "view", "deny")]);
      detail = await a.req(`task-approvals/detail?id=${id}`, undefined, observer); ok(detail);
      assert.equal(detail.data.cost, null);
      assert.equal(detail.data.expenses.find((e) => e.id === eid).amount, null);
      await setGrants(a, observer, [...full, grant("expenses", "view", "deny")]);
      detail = await a.req(`task-approvals/detail?id=${id}`, undefined, observer); ok(detail);
      assert.equal(detail.data.cost, null); assert.deepEqual(detail.data.expenses, []);
      await setGrants(a, observer, [...full, grant("tasks", "view", "deny")]);
      assert.equal((await a.req(`task-approvals/detail?id=${id}`, undefined, observer)).status, 403);
      let list = await a.req("task-approvals", undefined, observer); ok(list); assert.deepEqual(list.data.rows, []);
      await setGrants(a, observer, [grant("tasks", "view"), grant("task_approvals", "view", "allow", { scope: "project", projectId: "unrelated-project" })]);
      list = await a.req("task-approvals", undefined, observer); ok(list); assert.deepEqual(list.data.rows, []);
      assert.equal((await a.req(`task-approvals/detail?id=${id}`, undefined, observer)).status, 403);
      await setGrants(a, observer, [...full, grant("task_approvals", "stop_payment", "deny")]);
      assert.equal((await decision(a, id, "stop_payment", {}, observer)).status, 403);
      assert.equal((await approval(a, id)).payment_hold, 0);
      assert.equal((await a.req("task-approvals", undefined, null)).status, 401);
    }));

    await t.test("payment hold rolls back payment and receipt binding, resumes once, and cannot be removed by expense editing", () => usingFixture(async (a) => {
      const id = await complete(a), eid = await saveExpense(a, { task_id: id });
      ok(await review(a, eid, a.manager)); ok(await review(a, eid, owner));
      const draftId = await saveExpense(a, { task_id: id, status: "draft" });
      ok(await decision(a, id, "stop_payment"));
      const receipt = await upload(a, "expenses", "reimbursement", owner, { entity: eid, attach_later: "true" });
      const pay = { id: eid, amount: "115.50", date: "2027-01-11", reference: "ADMIN-HOLD-PAYMENT", files: [receipt] };
      assert.equal((await a.req("expenses/pay", pay, owner, { key: "blocked-payment-key" })).status, 409);
      assert.equal((await a.DB.prepare("SELECT count(*) AS n FROM nl_payments WHERE expense_id=?").bind(eid).first()).n, 0);
      assert.equal((await row(a, "nl_files", receipt)).entity_type, "draft", "failed batch must not consume receipt");
      const draft = await row(a, "nl_expenses", draftId);
      const edit = { id: draftId, version: draft.version, project_id: a.pid, committee_id: a.cid, title: draft.title, amount: "115.50", date: "2027-01-10", funding_source: "personal", status: "draft" };
      for (const task_id of [null, ""]) {
        const denied = await a.req("expenses/save", { ...edit, task_id }, a.member);
        assert.ok([400, 409].includes(denied.status), JSON.stringify(denied));
        assert.equal(JSON.parse((await row(a, "nl_expenses", draftId)).meta).task_id, id);
      }
      const omitted = await a.req("expenses/save", edit, a.member);
      assert.ok([200, 400, 409].includes(omitted.status), JSON.stringify(omitted));
      assert.equal(JSON.parse((await row(a, "nl_expenses", draftId)).meta).task_id, id, "omission cannot silently unlink a held task");
      const differentTask = await saveTask(a);
      const replacement = await a.req("expenses/save", { ...edit, version: (await row(a, "nl_expenses", draftId)).version, task_id: differentTask }, a.member);
      assert.ok([400, 409].includes(replacement.status), JSON.stringify(replacement));
      assert.equal(JSON.parse((await row(a, "nl_expenses", draftId)).meta).task_id, id);
      ok(await decision(a, id, "resume_payment"));
      ok(await a.req("expenses/pay", pay, owner, { key: "blocked-payment-key" }));
      ok(await a.req("expenses/pay", pay, owner, { key: "blocked-payment-key" }));
      assert.equal((await a.DB.prepare("SELECT count(*) AS n,SUM(amount) AS total FROM nl_payments WHERE expense_id=?").bind(eid).first()).total, 11550);
      assert.equal((await row(a, "nl_tasks", id)).status, "done");
    }));

    await t.test("direct expense final approval cannot bypass the payment hold or partially save its approval", () => usingFixture(async (a) => {
      const id = await complete(a);
      await setGrants(a, a.member, [grant("expenses", "pay")]);
      const eid = await saveExpense(a, { task_id: id, funding_source: "direct" });
      ok(await review(a, eid, a.manager));
      const before = await row(a, "nl_expenses", eid);
      ok(await decision(a, id, "stop_payment"));
      assert.equal((await review(a, eid, owner)).status, 409);
      assert.deepEqual(await row(a, "nl_expenses", eid), before, "second approval and settlement roll back together");
      assert.equal((await a.DB.prepare("SELECT count(*) AS n FROM nl_payments WHERE expense_id=?").bind(eid).first()).n, 0);
      ok(await decision(a, id, "resume_payment")); ok(await review(a, eid, owner));
      assert.equal((await row(a, "nl_expenses", eid)).status, "approved");
      assert.equal((await a.DB.prepare("SELECT SUM(amount) AS total FROM nl_payments WHERE expense_id=?").bind(eid).first()).total, 11550);
    }));
  });
}
