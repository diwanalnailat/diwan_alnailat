import test from "node:test";
import assert from "node:assert/strict";
import { fixture, saveTask, addMember, owner } from "./support.mjs";
import "../public/workspace.js";
import "../public/workspace-views.js";

function viewContext(S) {
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  return {
    S,
    project: "",
    committee: "",
    today: () => "2026-09-20",
    esc,
    icon: () => "",
    num: String,
    cash: String,
    date: String,
    done: (t) => t.status === "done",
    can: () => false,
    mayCreate: () => false,
    btn: (title, action, id = "") =>
      `<button data-action="${action}" data-id="${esc(id)}">${title}</button>`,
    person: (id) => id || "",
    projectName: () => "Fixture project",
    locationView: () => "",
    projectSelect: () => "",
    committeeSelect: () => "",
  };
}

test("role dashboards select their own data, preserve denials and keep admin overview", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a, {
      title: "My assigned task",
      due: "2026-09-19",
    });
    // A member can have broader read access elsewhere, without broadening their personal dashboard.
    await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
      .bind(
        JSON.stringify([
          { resource: "tasks", action: "view", effect: "allow", scope: "all" },
        ]),
        a.member.memberId,
      )
      .run();
    const old = await a.DB.prepare("SELECT * FROM nl_tasks WHERE id=?")
      .bind(id)
      .first();
    await a.DB.prepare(
      "INSERT INTO nl_tasks(id,project_id,title,status,assignee_id,created_by,created,updated,meta) VALUES('unrelated-dashboard-task',?,'Other task','todo',?,?,?,?,?)",
    )
      .bind(
        a.pid,
        a.manager.memberId,
        old.created_by,
        old.created,
        old.updated,
        JSON.stringify({
          ...JSON.parse(old.meta),
          committee_id: "outside-committee",
        }),
      )
      .run();
    const originalPrepare = a.DB.prepare.bind(a.DB),
      reads = [];
    a.DB.prepare = (sql) => {
      reads.push(sql);
      return originalPrepare(sql);
    };
    const member = await a.req("state?view=overview", undefined, a.member);
    assert.equal(member.status, 200);
    assert.equal(member.data.dashboard.role, "member");
    assert.deepEqual(
      member.data.tasks.map((t) => t.id),
      [id],
    );
    assert.ok(
      reads.some((sql) => /FROM nl_tasks WHERE \(assignee_id=\? OR json_extract/.test(sql)),
    );
    assert.ok(
      !reads.some((sql) =>
        /FROM nl_(assets|movements|files|suppliers)\b/.test(sql),
      ),
      "unrendered modules are not fetched",
    );
    assert.ok(
      reads.some((sql) =>
        /FROM nl_expenses WHERE \(created_by=\? OR json_extract/.test(sql),
      ),
    );
    const html = globalThis.DiwanViews.overview(viewContext(member.data));
    assert.match(html, /data-dashboard="member"/);
    assert.match(html, /My assigned task/);
    assert.doesNotMatch(html, /Other task|قرارات موجهة إليّ/);
    assert.ok(
      (await a.req("state?view=tasks", undefined, a.member)).data.tasks.some(
        (t) => t.id === "unrelated-dashboard-task",
      ),
      "normal tasks access is unchanged",
    );
    reads.length = 0;
    const manager = await a.req("state?view=overview", undefined, a.manager);
    assert.equal(manager.status, 200);
    assert.equal(manager.data.dashboard.role, "supervisor");
    assert.deepEqual(manager.data.dashboard.committee_ids, [a.cid]);
    assert.ok(
      reads.some((sql) =>
        /FROM nl_tasks WHERE json_extract\(meta,'\$\.committee_id'\) IN/.test(
          sql,
        ),
      ),
    );
    assert.ok(
      !reads.some((sql) =>
        /FROM nl_(assets|advances|suppliers|files)\b/.test(sql),
      ),
    );
    assert.match(
      globalThis.DiwanViews.overview(viewContext(manager.data)),
      /data-dashboard="supervisor"/,
    );
    assert.equal(
      (await a.req("state?view=overview", undefined, owner)).data.dashboard
        .role,
      "admin",
    );
    const supervisor = await addMember(a, "DashboardSupervisor", []);
    const committee = await a.DB.prepare(
      "SELECT members FROM nl_committees WHERE id=?",
    )
      .bind(a.cid)
      .first();
    await a.DB.prepare("UPDATE nl_committees SET members=? WHERE id=?")
      .bind(
        JSON.stringify([
          ...JSON.parse(committee.members),
          { id: supervisor.memberId, role: "supervisor", grants: [] },
        ]),
        a.cid,
      )
      .run();
    const supervision = (
      await a.req("state?view=overview", undefined, supervisor)
    ).data;
    assert.equal(supervision.dashboard.role, "supervisor");
    assert.equal(
      globalThis.DiwanWorkspace.derive(supervision, { can: () => false })
        .decisions.length,
      0,
      "supervision does not grant approval",
    );
    await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
      .bind(
        JSON.stringify([
          {
            resource: "committees",
            action: "view",
            effect: "deny",
            scope: "all",
          },
        ]),
        supervisor.memberId,
      )
      .run();
    const denied = (await a.req("state?view=overview", undefined, supervisor))
      .data;
    assert.equal(denied.dashboard.role, "member");
    assert.deepEqual(denied.dashboard.committee_ids, []);
  } finally {
    await a.DB.close();
  }
});
