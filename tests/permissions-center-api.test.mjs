import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import {
  fixture,
  owner,
  full,
  addMember,
  saveTask,
  saveExpense,
  review,
  state,
  upload,
} from "./support.mjs";

const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.data));
const grant = (resource, action, effect = "allow", extra = {}) => ({
  resource,
  action,
  effect,
  scope: "all",
  ...extra,
});
const row = (a, table, id) =>
  a.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
async function setup(mode, run) {
  process.env.DIWAN_TEST_DATABASE = mode;
  const a = await fixture();
  try {
    await run(a);
  } finally {
    if (mode === "sqlite") a.DB.close();
  }
}
async function catalog(a, as = owner) {
  const r = await a.req("permissions", undefined, as);
  ok(r);
  return r.data;
}
async function saveUser(a, member, grants, as = owner, override = {}) {
  const current = await row(a, "nl_members", member.memberId || member.id);
  return a.req(
    "permissions/save",
    {
      kind: "user",
      id: current.id,
      version: current.version,
      grants,
      ...override,
    },
    as,
  );
}
const memberRole = (data) => {
  const role = data.roles.find(
    (r) => /member/.test(r.id) && !/manager/.test(r.id),
  );
  assert.ok(role, "catalog exposes an ordinary committee member template");
  return role;
};

for (const mode of ["sqlite", "postgres"]) {
  test(`${mode}: changing a title cannot delegate a powerful role beyond the administrator's access`, () =>
    setup(mode, async (a) => {
      const target = await row(a, "nl_members", a.member.memberId);
      await a.DB.prepare("UPDATE nl_members SET team='Operations' WHERE id=?")
        .bind(target.id)
        .run();
      const roles = (await catalog(a)).roles;
      const role = roles.find((r) => r.id === "role:team:Operations");
      ok(
        await a.req("permissions/save", {
          kind: "role",
          id: role.id,
          version: role.version,
          grants: [grant("settings", "manage")],
        }),
      );
      const admin = await addMember(a, "limited-permission-admin", [
        grant("permissions", "view"),
        grant("permissions", "manage"),
        grant("users", "manage"),
      ]);
      const other = await row(a, "nl_members", a.outsider.memberId);
      assert.equal(
        (
          await a.req(
            "users/save",
            { ...other, grants: [], bundles: [], team: "Operations" },
            admin,
          )
        ).status,
        403,
      );
      assert.equal((await row(a, "nl_members", other.id)).team, other.team);
    }));
  test(`${mode}: permissions catalog, preview and optimistic user updates honor dedicated access`, () =>
    setup(mode, async (a) => {
      assert.equal(
        (await a.req("permissions", undefined, a.outsider)).status,
        403,
      );
      const data = await catalog(a);
      for (const key of ["resources", "actions", "resource_actions", "aliases"])
        assert.ok(data[key], key);
      assert.ok(data.roles.length);
      assert.ok(data.roles.every((r) => r.id.startsWith("role:")));
      assert.ok(data.users.some((u) => u.id === a.member.memberId));
      const viewer = await addMember(a, "permission-reader", [
        grant("permissions", "view"),
      ]);
      ok(await a.req("permissions", undefined, viewer));
      assert.equal((await saveUser(a, a.member, [], viewer)).status, 403);
      const before = await row(a, "nl_members", a.member.memberId);
      const denied = [grant("tasks", "view", "deny")];
      const preview = await a.req("permissions/preview", {
        kind: "user",
        id: before.id,
        grants: denied,
      });
      ok(preview);
      assert.ok(Array.isArray(preview.data.access));
      assert.ok(Array.isArray(preview.data.restrictions));
      assert.ok(Array.isArray(preview.data.effective_grants));
      assert.deepEqual(
        await row(a, "nl_members", before.id),
        before,
        "preview is read-only",
      );
      const saved = await saveUser(a, a.member, denied);
      ok(saved);
      const after = await row(a, "nl_members", before.id);
      assert.equal(after.version, before.version + 1);
      assert.deepEqual(JSON.parse(after.grants), denied);
      assert.equal(after.name, before.name);
      assert.equal(after.status, before.status);
      assert.equal(after.team, before.team);
      assert.equal(
        (await saveUser(a, a.member, [], owner, { version: before.version }))
          .status,
        409,
      );
      assert.deepEqual(await row(a, "nl_members", before.id), after);
    }));

  test(`${mode}: role templates stay committee scoped and user denies/expiry override them without title escalation`, () =>
    setup(mode, async (a) => {
      const tid = await saveTask(a);
      const data = await catalog(a),
        role = memberRole(data);
      const saved = await a.req("permissions/save", {
        kind: "role",
        id: role.id,
        version: role.version,
        grants: [grant("tasks", "view"), grant("tasks", "export")],
      });
      ok(saved);
      const currentRole = (await catalog(a)).roles.find(
        (r) => r.id === role.id,
      );
      assert.equal(currentRole.version, role.version + 1);
      assert.equal(
        (
          await a.req("permissions/save", {
            kind: "role",
            id: role.id,
            version: role.version,
            grants: [],
          })
        ).status,
        409,
      );
      ok(await a.req("tasks/" + tid, undefined, a.member));
      ok(
        await a.req(
          "export?type=tasks&committee=" + a.cid,
          undefined,
          a.member,
        ),
      );
      const committee = await row(a, "nl_committees", a.cid),
        members = JSON.parse(committee.members);
      members.find((m) => m.id === a.member.memberId).title = "مدير النظام";
      await a.DB.prepare("UPDATE nl_committees SET members=? WHERE id=?")
        .bind(JSON.stringify(members), a.cid)
        .run();
      assert.equal(
        (await a.req("permissions", undefined, a.member)).status,
        403,
        "display title is not an administrative role",
      );
      const other = await a.req("committees/save", {
        project_id: a.pid,
        name: "لجنة خارج النطاق",
        members: [],
      });
      ok(other);
      const external = await a.req("tasks/save", {
        project_id: a.pid,
        title: "مهمة خارج اللجنة",
        description: "اختبار النطاق",
        priority: "normal",
        status: "todo",
        meta: {
          committee_id: other.data.id,
          type: "execution",
          outcome: "اختبار",
        },
      });
      ok(external);
      assert.equal(
        (await a.req("tasks/" + external.data.id, undefined, a.member)).status,
        403,
      );
      ok(
        await saveUser(a, a.member, [
          grant("tasks", "view", "deny", {
            expires: "2099-01-01T00:00:00.000Z",
          }),
        ]),
      );
      assert.equal(
        (await a.req("tasks/" + tid, undefined, a.member)).status,
        403,
      );
      assert.ok(!(await state(a, a.member)).tasks.some((t) => t.id === tid));
      ok(
        await saveUser(a, a.member, [
          grant("tasks", "view", "deny", {
            expires: "2000-01-01T00:00:00.000Z",
          }),
        ]),
      );
      ok(await a.req("tasks/" + tid, undefined, a.member));
    }));

  test(`${mode}: permission delegation cannot expand scopes, extend expiry, lock out self or bypass legacy routes`, () =>
    setup(mode, async (a) => {
      const role = memberRole(await catalog(a));
      const expiry = new Date(Date.now() + 3600000).toISOString();
      const narrow = await addMember(a, "narrow-permission-admin", [
        grant("permissions", "view"),
        grant("permissions", "manage"),
        grant("tasks", "view", "allow", {
          scope: "committee",
          committeeId: a.cid,
          expires: expiry,
        }),
      ]);
      const before = await row(a, "nl_members", a.outsider.memberId);
      assert.equal(
        (await saveUser(a, a.outsider, [grant("tasks", "view")], narrow))
          .status,
        403,
      );
      assert.equal(
        (
          await saveUser(
            a,
            a.outsider,
            [
              grant("tasks", "view", "allow", {
                scope: "committee",
                committeeId: a.cid,
              }),
            ],
            narrow,
          )
        ).status,
        403,
      );
      assert.deepEqual(await row(a, "nl_members", before.id), before);
      ok(
        await saveUser(
          a,
          a.outsider,
          [
            grant("tasks", "view", "allow", {
              scope: "committee",
              committeeId: a.cid,
              expires: expiry,
            }),
          ],
          narrow,
        ),
      );
      ok(
        await a.req(
          "permissions/save",
          {
            kind: "role",
            id: role.id,
            version: role.version,
            grants: [
              grant("tasks", "view", "allow", {
                scope: "committee",
                committeeId: a.cid,
                expires: expiry,
              }),
            ],
          },
          narrow,
        ),
      );
      const scopedRole = (await catalog(a)).roles.find((r) => r.id === role.id);
      assert.equal(scopedRole.grants[0].committeeId, a.cid);
      assert.equal(
        scopedRole.grants[0].scope,
        "committee",
        "scoped administrators cannot convert a template grant to global access",
      );
      const admin = (await catalog(a)).users.find((u) => u.id === "owner");
      assert.ok(admin);
      assert.equal(
        (
          await a.req("permissions/save", {
            kind: "user",
            id: admin.id,
            version: admin.version,
            grants: [],
          })
        ).status,
        400,
      );
      const blocked = await addMember(a, "blocked-permission-admin", [
        ...full,
        grant("permissions", "manage", "deny"),
      ]);
      assert.equal((await saveUser(a, a.member, [], blocked)).status, 403);
      const member = await row(a, "nl_members", a.member.memberId);
      const legacy = {
        id: member.id,
        version: member.version,
        name: member.name,
        email: member.email,
        status: member.status,
        grants: [grant("tasks", "view")],
        bundles: [],
        team: member.team,
      };
      assert.equal((await a.req("users/save", legacy, blocked)).status, 403);
      assert.equal(
        (
          await a.req(
            "bundles/save",
            { name: "غير مسموح", grants: [] },
            blocked,
          )
        ).status,
        403,
      );
      const protectedBundle = await a.req("bundles/save", {
        id: role.id,
        version: role.version,
        name: "دور معدل من واجهة قديمة",
        grants: [],
      });
      assert.equal(protectedBundle.status, 400);
      const reservedAttachment = await a.req("users/save", {
        ...legacy,
        grants: [],
        bundles: [role.id],
      });
      assert.equal(reservedAttachment.status, 400);
      const committee = await row(a, "nl_committees", a.cid);
      assert.equal(
        (
          await a.req(
            "committees/save",
            {
              id: committee.id,
              project_id: a.pid,
              version: committee.version,
              name: committee.name,
              members: [
                ...JSON.parse(committee.members),
                { id: a.outsider.memberId, role: "member", grants: [] },
              ],
            },
            blocked,
          )
        ).status,
        403,
      );
    }));

  test(`${mode}: granular task, expense and file denies are enforced at APIs beyond old edit/approve grants`, () =>
    setup(mode, async (a) => {
      const tid = await saveTask(a),
        eid = await saveExpense(a);
      ok(
        await saveUser(a, a.member, [
          grant("tasks", "comment", "deny"),
          grant("tasks", "upload", "deny"),
        ]),
      );
      assert.equal(
        (
          await a.req(
            "tasks/comment",
            { id: tid, body: "تعليق غير مسموح" },
            a.member,
          )
        ).status,
        403,
      );
      const fd = new FormData();
      fd.set(
        "file",
        new File(["%PDF-1.7\nsynthetic"], "proof.pdf", {
          type: "application/pdf",
        }),
      );
      fd.set("resource", "tasks");
      fd.set("entity", tid);
      fd.set("purpose", "proof");
      const forbiddenUpload = await worker.fetch(
        new Request("https://diwan.test/api/upload", {
          method: "POST",
          headers: {
            origin: "https://diwan.test",
            "oai-authenticated-user-id": a.member.id,
            "oai-authenticated-user-email": a.member.email,
          },
          body: fd,
        }),
        a.env,
      );
      assert.equal(forbiddenUpload.status, 403);
      const draft = await saveExpense(a, { status: "draft" });
      ok(
        await saveUser(a, a.member, [
          grant("tasks", "submit", "deny"),
          grant("expenses", "submit", "deny"),
        ]),
      );
      const task = await row(a, "nl_tasks", tid),
        taskMeta = JSON.parse(task.meta);
      taskMeta.checklist = [];
      await a.DB.prepare("UPDATE nl_tasks SET status='doing',meta=? WHERE id=?")
        .bind(JSON.stringify(taskMeta), tid)
        .run();
      assert.equal(
        (
          await a.req(
            "tasks/transition",
            {
              id: tid,
              version: task.version,
              status: "review",
              note: "تم الإنجاز",
            },
            a.member,
          )
        ).status,
        403,
      );
      const draftRow = await row(a, "nl_expenses", draft);
      assert.equal(
        (
          await a.req(
            "expenses/save",
            {
              id: draft,
              version: draftRow.version,
              project_id: a.pid,
              committee_id: a.cid,
              title: draftRow.title,
              amount: "115.50",
              date: "2027-01-10",
              status: "pending",
              funding_source: "personal",
            },
            a.member,
          )
        ).status,
        403,
      );
      ok(
        await saveUser(a, a.manager, [
          grant("expenses", "reject", "deny"),
          grant("tasks", "return", "deny"),
        ]),
      );
      await a.DB.prepare("UPDATE nl_tasks SET status='review' WHERE id=?")
        .bind(tid)
        .run();
      assert.equal(
        (
          await a.req(
            "tasks/transition",
            {
              id: tid,
              version: task.version,
              status: "doing",
              note: "تحتاج تعديل",
            },
            a.manager,
          )
        ).status,
        403,
      );
      const expense = await row(a, "nl_expenses", eid);
      assert.equal(
        (
          await a.req(
            "expenses/review",
            {
              id: eid,
              version: expense.version,
              decision: "reject",
              reason: "رفض المصروف",
            },
            a.manager,
          )
        ).status,
        403,
      );
      ok(await review(a, eid, a.manager));
      const proof = await upload(a, "tasks", "proof", a.manager, {
        entity: tid,
        attach_later: "true",
      });
      ok(await saveUser(a, a.manager, [grant("tasks", "download", "deny")]));
      const file = await worker.fetch(
        new Request("https://diwan.test/api/files/" + proof, {
          headers: {
            "oai-authenticated-user-id": a.manager.id,
            "oai-authenticated-user-email": a.manager.email,
          },
        }),
        a.env,
      );
      assert.equal(
        file.status,
        403,
        "draft-file creator does not bypass explicit download deny",
      );
    }));

  test(`${mode}: explicit rejection and cancellation preserve owner checks, approved records and paid balances`, () =>
    setup(mode, async (a) => {
      const pending = await saveExpense(a);
      let expense = await row(a, "nl_expenses", pending);
      const cancel = {
        id: pending,
        version: expense.version,
        reason: "لم تعد الحاجة قائمة",
      };
      ok(
        await saveUser(a, a.outsider, [
          grant("expenses", "view"),
          grant("expenses", "cancel"),
        ]),
      );
      assert.equal(
        (await a.req("expenses/cancel", cancel, a.outsider)).status,
        403,
      );
      ok(await saveUser(a, a.member, [grant("expenses", "cancel", "deny")]));
      assert.equal(
        (await a.req("expenses/cancel", cancel, a.member)).status,
        403,
      );
      ok(await saveUser(a, a.member, [grant("expenses", "cancel")]));
      assert.equal(
        (await a.req("expenses/cancel", { ...cancel, version: 0 }, a.member))
          .status,
        409,
      );
      ok(await a.req("expenses/cancel", cancel, a.member));
      assert.equal((await row(a, "nl_expenses", pending)).status, "cancelled");
      assert.equal((await review(a, pending, a.manager)).status, 409);
      const rejected = await saveExpense(a);
      expense = await row(a, "nl_expenses", rejected);
      ok(
        await a.req(
          "expenses/review",
          {
            id: rejected,
            version: expense.version,
            decision: "reject",
            reason: "مصروف غير معتمد",
          },
          a.manager,
        ),
      );
      assert.equal((await row(a, "nl_expenses", rejected)).status, "rejected");
      assert.equal(
        (
          await a.req("expenses/pay", {
            id: rejected,
            amount: "1",
            date: "2027-01-10",
            reference: "DENIED",
          })
        ).status,
        400,
      );
      const approved = await saveExpense(a);
      ok(await review(a, approved, a.manager));
      ok(await review(a, approved, owner));
      expense = await row(a, "nl_expenses", approved);
      assert.equal(
        (
          await a.req(
            "expenses/cancel",
            { id: approved, version: expense.version, reason: "لا يجوز" },
            a.member,
          )
        ).status,
        409,
      );
      const receipt = await upload(a, "expenses", "reimbursement", owner, {
        entity: approved,
        attach_later: "true",
      });
      ok(
        await a.req("expenses/pay", {
          id: approved,
          amount: "10",
          date: "2027-01-10",
          reference: "PAID",
          files: [receipt],
        }),
      );
      assert.equal(
        (
          await a.req(
            "expenses/cancel",
            { id: approved, version: expense.version, reason: "لا يجوز" },
            owner,
          )
        ).status,
        409,
      );
      assert.equal(
        (await state(a)).expenses.find((e) => e.id === approved).paid,
        1000,
      );
    }));

  test(`${mode}: document denies cannot be bypassed through task access, export or guide ownership`, () =>
    setup(mode, async (a) => {
      const tid = await saveTask(a);
      const created = await a.req("guides/save", {
        project_id: a.pid,
        task_id: tid,
        title: "دليل تنفيذ خاص",
        content: {
          sections: [{ title: "تفاصيل", body: "محتوى داخلي تجريبي" }],
        },
      });
      ok(created);
      await a.DB.prepare("UPDATE nl_guides SET created_by=? WHERE id=?")
        .bind(a.manager.memberId, created.data.id)
        .run();
      ok(
        await saveUser(a, a.manager, [
          grant("assistant", "create"),
          grant("documents", "view", "deny"),
          grant("documents", "export", "deny"),
          grant("documents", "edit", "deny"),
        ]),
      );
      assert.equal(
        (
          await a.req(
            "guides/" + created.data.id + "/export",
            undefined,
            a.manager,
          )
        ).status,
        403,
      );
      const task = await a.req("tasks/" + tid, undefined, a.manager);
      ok(task);
      assert.ok(!task.data.guides.some((g) => g.id === created.data.id));
      assert.ok(
        !(await state(a, a.manager)).guides.some(
          (g) => g.id === created.data.id,
        ),
      );
      const old = await row(a, "nl_guides", created.data.id);
      assert.equal(
        (
          await a.req(
            "guides/save",
            {
              id: old.id,
              version: old.version,
              project_id: a.pid,
              task_id: tid,
              title: "تعديل ممنوع",
              content: { sections: [] },
            },
            a.manager,
          )
        ).status,
        403,
      );
      assert.deepEqual(await row(a, "nl_guides", old.id), old);
    }));

  test(`${mode}: revoking an administrator during a permission save aborts the stale grant`, () =>
    setup(mode, async (a) => {
      const admin = await addMember(a, "revoked-during-save", full);
      const before = await row(a, "nl_members", a.member.memberId);
      const sources = new WeakMap();
      let revoked = false;
      a.env.DB = {
        dialect: a.DB.dialect,
        prepare(sql) {
          const statement = a.DB.prepare(sql),
            bind = statement.bind;
          sources.set(statement, sql);
          statement.bind = (...args) => {
            const bound = bind(...args);
            sources.set(bound, sql);
            return bound;
          };
          return statement;
        },
        async batch(statements) {
          if (
            !revoked &&
            statements.some((s) =>
              /^INSERT INTO nl_receipts/.test(sources.get(s) || ""),
            )
          ) {
            revoked = true;
            await a.DB.prepare(
              "UPDATE nl_members SET grants='[]',version=version+1 WHERE id=?",
            )
              .bind(admin.memberId)
              .run();
          }
          return a.DB.batch(statements);
        },
      };
      const saved = await saveUser(
        a,
        a.member,
        [grant("tasks", "export")],
        admin,
      );
      assert.equal(revoked, true);
      assert.equal(saved.status, 409, JSON.stringify(saved.data));
      assert.deepEqual(await row(a, "nl_members", before.id), before);
    }));
}
