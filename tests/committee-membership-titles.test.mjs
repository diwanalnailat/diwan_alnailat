import test from "node:test";
import assert from "node:assert/strict";
import { app, addMember, addProject, owner } from "./support.mjs";
import { permitted, withCommittees } from "../lib/domain.js";

process.env.DIWAN_TEST_DATABASE = "postgres";

const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.data));
const registry = async (a) =>
  (
    await a.DB.prepare(
      "SELECT key,value FROM nl_settings WHERE key LIKE 'committee-member-title:%' ORDER BY key",
    ).all()
  ).results;
const committee = (a, id) =>
  a.DB.prepare("SELECT * FROM nl_committees WHERE id=?").bind(id).first();
const person = (a, id) =>
  a.DB.prepare("SELECT * FROM nl_members WHERE id=?").bind(id).first();

test("custom membership titles persist across committees without creating privileges or replacing manager membership", async () => {
  const a = await app(),
    pid = await addProject(a);
  const manager = await addMember(a, "title-manager", []);
  const member = await addMember(a, "title-member", []);
  const body = {
    project_id: pid,
    name: "لجنة الصفات",
    manager_id: manager.memberId,
    members: [
      {
        id: member.memberId,
        role: "member",
        title: "  منسق   علاقات  ",
        grants: [],
      },
    ],
  };
  const first = await a.req("committees/save", body);
  ok(first);
  const firstRow = await committee(a, first.data.id);
  const links = JSON.parse(firstRow.members);
  assert.equal(
    links.find((m) => m.id === member.memberId).title,
    "منسق علاقات",
  );
  assert.equal(links.filter((m) => m.id === manager.memberId).length, 1);
  assert.equal(firstRow.manager_id, manager.memberId);
  assert.equal((await registry(a)).length, 1);
  const state = await a.req("state");
  ok(state);
  assert.deepEqual(state.data.membershipTitles, ["منسق علاقات"]);
  assert.deepEqual(
    (await a.req("state", undefined, member)).data.membershipTitles,
    [],
  );
  const scoped = withCommittees(await person(a, member.memberId), [firstRow]);
  for (const [resource, action] of [
    ["users", "manage"],
    ["tasks", "approve"],
    ["expenses", "approve"],
  ])
    assert.equal(
      permitted(scoped, resource, action, {
        project_id: pid,
        committee_id: firstRow.id,
      }),
      false,
    );

  // The title comes from the registry in a future form; a manager can also hold
  // an explicit membership title without losing or duplicating either role.
  const second = await a.req("committees/save", {
    ...body,
    name: "لجنة لاحقة",
    members: [
      {
        id: manager.memberId,
        role: "member",
        title: state.data.membershipTitles[0],
        grants: [],
      },
    ],
  });
  ok(second);
  const secondRow = await committee(a, second.data.id);
  assert.deepEqual(JSON.parse(secondRow.members), [
    {
      id: manager.memberId,
      role: "member",
      title: "منسق علاقات",
      grants: [],
    },
  ]);
  assert.equal(
    permitted(
      withCommittees(await person(a, manager.memberId), [secondRow]),
      "tasks",
      "approve",
      { project_id: pid, committee_id: secondRow.id },
    ),
    true,
  );
  assert.equal(
    (await registry(a)).length,
    1,
    "normalized equivalent titles share one registry entry",
  );

  // Isolated PostgreSQL fixture only: registry lifetime is independent of the
  // committee that first introduced a title.
  await a.DB.prepare("DELETE FROM nl_committees WHERE id IN (?,?)")
    .bind(firstRow.id, secondRow.id)
    .run();
  assert.deepEqual((await a.req("state")).data.membershipTitles, [
    "منسق علاقات",
  ]);
  const third = await a.req("committees/save", {
    ...body,
    name: "لجنة جديدة بعد الحذف",
  });
  ok(third);
  assert.equal((await registry(a)).length, 1);
});

test("invalid, unauthorized and conflicting committee saves never pollute the shared title registry", async () => {
  const a = await app(),
    pid = await addProject(a);
  const member = await addMember(a, "title-subject", []);
  const creator = await addMember(a, "title-creator", [
    {
      resource: "committees",
      action: "create",
      effect: "allow",
      scope: "project",
      projectId: pid,
    },
  ]);
  const body = { project_id: pid, name: "لجنة التحقق", members: [] };
  const membership = {
    id: member.memberId,
    role: "member",
    title: "منسق الميدان",
    grants: [],
  };
  const invalid = [
    { ...membership, role: "admin" },
    { ...membership, role: "supervisor" },
    { ...membership, title: " " },
    { ...membership, title: "ص".repeat(81) },
    {
      ...membership,
      grants: [{ resource: "users", action: "manage", effect: "allow" }],
    },
  ];
  for (const entry of invalid) {
    const rejected = await a.req("committees/save", {
      ...body,
      members: [entry],
    });
    assert.equal(rejected.status, 400, JSON.stringify(rejected.data));
    assert.deepEqual(await registry(a), []);
  }
  const unauthorized = await a.req(
    "committees/save",
    { ...body, members: [membership] },
    creator,
  );
  assert.equal(unauthorized.status, 403);
  assert.deepEqual(await registry(a), []);
  assert.equal(
    (await a.DB.prepare("SELECT count(*) AS n FROM nl_committees").first()).n,
    0,
  );

  const saved = await a.req("committees/save", {
    ...body,
    members: [membership],
  });
  ok(saved);
  const old = await committee(a, saved.data.id);
  const before = await registry(a);
  const stale = await a.req(
    "committees/save",
    {
      ...body,
      id: old.id,
      version: old.version - 1,
      members: [{ ...membership, title: "صفة لن تحفظ" }],
    },
    owner,
  );
  assert.equal(stale.status, 409);
  assert.deepEqual(await registry(a), before);
  assert.deepEqual(await committee(a, old.id), old);
});
