import test from "node:test";
import assert from "node:assert/strict";
import { fixture, saveTask, addMember, addProject } from "./support.mjs";
import { workspaceSearch } from "../lib/workspace-search.js";

const ok = (result) => assert.equal(result.status, 200, JSON.stringify(result.data));
const grant = (resource, action, effect = "allow", extra = {}) => ({ resource, action, effect, scope: "all", ...extra });
async function withFixture(run) {
  const a = await fixture();
  try { await run(a); } finally { if (process.env.DIWAN_TEST_DATABASE !== "postgres") await a.DB.close(); }
}
for (const database of ["sqlite", "postgres"]) {
  test(`workspace read authorization (${database})`, async (t) => {
    process.env.DIWAN_TEST_DATABASE = database;
    await t.test("document search shares linked-task access and committee-scoped denials with document reads", () => withFixture(async (a) => {
      const tid = await saveTask(a);
      const guide = await a.req("guides/save", {
        project_id: a.pid, task_id: tid, title: "Confidential committee guide",
        content: { sections: [{ title: "Private instructions", body: "Never expose this content in search" }] },
      }); ok(guide);
      const path = "search?q=Confidential";
      const member = await a.req(path, undefined, a.member); ok(member);
      assert.ok(member.data.results.some((entry) => entry.id === guide.data.id), "task view authorizes its guide through the same policy as detail");
      assert.ok(member.data.results.every((entry) => Object.keys(entry).every((key) => ["id", "resource", "action", "title"].includes(key))));
      await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?").bind(JSON.stringify([
        grant("documents", "view"),
        grant("documents", "view", "deny", { scope: "committee", committeeId: a.cid }),
      ]), a.manager.memberId).run();
      const manager = await a.req(path, undefined, a.manager); ok(manager);
      assert.ok(!manager.data.results.some((entry) => entry.id === guide.data.id), "search cannot lose the task's committee when evaluating a document deny");
      const task = await a.req("tasks/" + tid, undefined, a.manager); ok(task);
      assert.ok(!task.data.guides.some((entry) => entry.id === guide.data.id));
      assert.equal((await a.req("guides/" + guide.data.id + "/export", undefined, a.manager)).status, 403);
      await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?").bind(JSON.stringify([
        grant("documents", "view", "allow", { expires: "2000-01-01T00:00:00Z" }),
      ]), a.outsider.memberId).run();
      const expired = await a.req(path, undefined, a.outsider); ok(expired);
      assert.deepEqual(expired.data.results, []);
    }));
    await t.test("audit rows enforce project restrictions after module authorization", () => withFixture(async (a) => {
      const publicProject = await addProject(a, "Visible audit project");
      for (const [id, project] of [["audit-hidden-project", a.pid], ["audit-visible-project", publicProject]]) {
        await a.DB.prepare("INSERT INTO nl_audit(id,actor,action,resource,entity_id,project_id,detail,created) VALUES(?,?,?,?,?,?,?,?)")
          .bind(id, "owner", "Sensitive administrative action", "projects", project, project, "Private audit payload", "2027-01-01T00:00:00Z").run();
      }
      const auditor = await addMember(a, "scope-auditor", [
        grant("audit", "view"), grant("audit", "view", "deny", { scope: "project", projectId: a.pid }),
      ]);
      let result = await a.req("state?view=audit", undefined, auditor); ok(result);
      assert.ok(result.data.audit.some((item) => item.id === "audit-visible-project"));
      assert.ok(!result.data.audit.some((item) => item.project_id === a.pid));
      assert.ok(result.data.audit.every((item) => item.detail === ""));
      await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?").bind(JSON.stringify([
        grant("audit", "view", "allow", { scope: "project", projectId: publicProject }),
      ]), auditor.memberId).run();
      result = await a.req("state?view=audit", undefined, auditor); ok(result);
      assert.ok(result.data.audit.some((item) => item.id === "audit-visible-project"), "scoped permission is sufficient to open its audit rows");
      assert.ok(result.data.audit.every((item) => item.project_id === publicProject));
    }));
    await t.test("a selected reviewer sees review assignments on the personal dashboard while explicit denies still apply", () => withFixture(async (a) => {
      const committee = await a.DB.prepare("SELECT members FROM nl_committees WHERE id=?").bind(a.cid).first();
      await a.DB.prepare("UPDATE nl_committees SET members=? WHERE id=?").bind(JSON.stringify([
        ...JSON.parse(committee.members), { id: a.outsider.memberId, role: "member", grants: [] },
      ]), a.cid).run();
      const id = await saveTask(a, { title: "Personal review assignment", meta: { reviewer_id: a.outsider.memberId } });
      await saveTask(a, { title: "Another person's assignment" });
      let dashboard = await a.req("state?view=overview", undefined, a.outsider); ok(dashboard);
      assert.equal(dashboard.data.dashboard.role, "member");
      assert.deepEqual(dashboard.data.tasks.map((task) => task.id), [id]);
      await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?").bind(JSON.stringify([
        grant("tasks", "view", "deny"),
      ]), a.outsider.memberId).run();
      dashboard = await a.req("state?view=overview", undefined, a.outsider); ok(dashboard);
      assert.deepEqual(dashboard.data.tasks, []);
    }));
    await t.test("unauthenticated and disabled actors do not trigger workspace-wide reads", () => withFixture(async (a) => {
      await a.DB.prepare("UPDATE nl_members SET status='suspended' WHERE id=?").bind(a.outsider.memberId).run();
      const queries = [], prepare = a.DB.prepare.bind(a.DB);
      a.DB.prepare = (sql) => { queries.push(sql); return prepare(sql); };
      assert.equal((await a.req("state?view=reports", undefined, null)).status, 401);
      assert.deepEqual(queries, []);
      assert.equal((await a.req("state?view=reports", undefined, a.outsider)).status, 403);
      assert.equal(queries.length, 1);
      assert.match(queries[0], /FROM nl_members WHERE site_id=\?/);
    }));
    await t.test("ordinary task screens resolve only relevant people and cannot force a full directory read", () => withFixture(async (a) => {
      await saveTask(a);
      await a.DB.prepare("WITH RECURSIVE counter(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM counter WHERE n<1000) INSERT INTO nl_members(id,name,status,created) SELECT 'population-'||n,'Synthetic population '||n,'active','2026-10-13T00:00:00Z' FROM counter").run();
      const prepare = a.DB.prepare.bind(a.DB);
      let peopleRead = 0;
      a.DB.prepare = (sql) => {
        const wrap = (statement) => ({ ...statement,
          ...(statement.bind ? { bind: (...args) => wrap(statement.bind(...args)) } : {}),
          all: async () => {
            const result = await statement.all();
            if (sql.includes("FROM nl_members")) peopleRead += result.results.length;
            return result;
          },
        });
        return wrap(prepare(sql));
      };
      for (const actor of [undefined, a.member]) {
        peopleRead = 0;
        const result = await a.req("state?view=tasks", undefined, actor); ok(result);
        assert.equal(peopleRead, 3, "member query cardinality follows the visible committee, not the global directory");
        assert.equal(result.data.people.length, 3);
        assert.ok(result.data.people.every((person) => !person.id.startsWith("population-")));
      }
      peopleRead = 0;
      const deniedDirectory = await a.req("state?view=users", undefined, a.member); ok(deniedDirectory);
      assert.deepEqual(deniedDirectory.data.members, []);
      assert.equal(peopleRead, 3, "requesting the users view does not authorize its full-directory query");
      peopleRead = 0;
      const directory = await a.req("state?view=users"); ok(directory);
      assert.equal(directory.data.members.length, 1004);
      assert.equal(peopleRead, 1004, "explicit authorized directory behavior is preserved");
    }));
  });
}

test("search candidate work stops and reports partial results when every matching record is inaccessible", async () => {
  let queries = 0, generated = 0;
  const db = { prepare(sql) {
    assert.ok(++queries <= 20, "inaccessible matches must not cause an unbounded search loop");
    return { bind() { return { async all() {
      if (!sql.includes("FROM nl_tasks")) return { results: [] };
      return { results: Array.from({ length: 50 }, () => ({ id: String(++generated).padStart(6, "0"), title: "Shared search term" })) };
    } }; } };
  } };
  const c = { u: { id: "reader" }, bundles: [], can: () => false, projectRows: [], committees: [] };
  const result = await workspaceSearch(db, c, "Shared");
  assert.deepEqual(result.results, []);
  assert.equal(result.truncated, true, "caller must distinguish a scan cap from exhaustive absence");
  assert.equal(generated, 500);
});
