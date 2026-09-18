import { test } from "node:test";
import assert from "node:assert/strict";
import "../public/workspace.js";

const derive = globalThis.DiwanWorkspace.derive;
const options = { today: "2026-09-15", can: () => true };
function fixture() {
  return {
    user: { id: "manager", status: "active" },
    projects: [
      {
        id: "p1",
        title: "المشاركة الأولى",
        status: "active",
        due: "2026-09-20",
      },
      {
        id: "p2",
        title: "المشاركة الثانية",
        status: "active",
        due: "2026-10-01",
      },
      { id: "closed", title: "موسم مغلق", status: "closed", due: "2026-08-01" },
    ],
    committees: [
      {
        id: "c1",
        project_id: "p1",
        manager_id: "manager",
        config: {
          second_approver_id: "reviewer",
          budgetLines: [{ id: "line" }],
        },
      },
      { id: "c2", project_id: "p1", manager_id: "other", config: {} },
      { id: "c3", project_id: "p2", manager_id: "manager", config: {} },
    ],
    tasks: [
      {
        id: "late",
        title: "متأخرة",
        project_id: "p1",
        status: "doing",
        priority: "normal",
        due: "2026-09-14",
        assignee_id: "member",
        meta: { committee_id: "c1" },
      },
      {
        id: "review",
        title: "إنجاز للمراجعة",
        project_id: "p1",
        status: "review",
        due: "2026-09-15",
        meta: { committee_id: "c1" },
      },
      {
        id: "other-committee",
        project_id: "p1",
        status: "blocked",
        due: "2026-09-16",
        meta: { committee_id: "c2" },
      },
      {
        id: "other-project",
        project_id: "p2",
        status: "doing",
        due: "2026-09-15",
        meta: { committee_id: "c3" },
      },
      {
        id: "done",
        project_id: "p1",
        status: "done",
        due: "2026-09-01",
        meta: { committee_id: "c1" },
      },
    ],
    expenses: [
      {
        id: "expense",
        title: "مصروف للمراجعة",
        project_id: "p1",
        status: "pending",
        created_by: "creator",
        amount_hidden: true,
        effective_route: ["manager", "reviewer"],
        effective_approval_index: 0,
        meta: { committee_id: "c1", claimant_id: "member" },
      },
      {
        id: "expense-other",
        project_id: "p2",
        status: "pending",
        created_by: "creator",
        effective_route: ["other", "manager"],
        effective_approval_index: 0,
        meta: { committee_id: "c3", claimant_id: "member" },
      },
    ],
    advances: [
      { id: "a1", project_id: "p1", assignee_id: "member", balance: 40000 },
      { id: "a2", project_id: "p2", assignee_id: "member", balance: 70000 },
    ],
    assets: [
      {
        id: "asset1",
        name: "خيمة",
        ownership: "rented",
        condition: "maintenance",
        meta: { rental_end: "2026-09-22", warranty_end: "2026-10-01" },
      },
      {
        id: "asset2",
        name: "مركبة",
        ownership: "owned",
        condition: "ready",
        meta: {},
      },
    ],
    movements: [
      {
        id: "move1",
        asset_id: "asset1",
        project_id: "p1",
        type: "issue",
        quantity: 1,
      },
    ],
    integrations: { ai: false, whatsapp: true, voice: false, phone: true },
  };
}

test("workspace scope follows the selected committee and never assigns global assets or advances to it", () => {
  const state = fixture();
  const project = derive(state, { ...options, project: "p1" });
  assert.deepEqual(
    project.records.assets.map((row) => row.id),
    ["asset1"],
  );
  assert.deepEqual(
    project.records.advances.map((row) => row.id),
    ["a1"],
  );
  assert.equal(project.counts.tasks, 4);
  assert.equal(project.counts.completedTasks, 1);
  assert.equal(project.counts.progress, 25);
  const committee = derive(state, { ...options, committee: "c1" });
  assert.equal(committee.scope.project, "p1");
  assert.deepEqual(
    committee.records.projects.map((row) => row.id),
    ["p1"],
  );
  assert.deepEqual(
    committee.records.tasks.map((row) => row.id),
    ["late", "review", "done"],
  );
  assert.deepEqual(
    committee.records.expenses.map((row) => row.id),
    ["expense"],
  );
  assert.equal(committee.counts.assets, 0);
  assert.equal(committee.counts.advances, 0);
  assert.equal(committee.scope.assets, "unavailable_for_committee");
  for (const scope of [
    { project: "p2", committee: "c1" },
    { committee: "missing" },
  ]) {
    const invalid = derive(state, { ...options, ...scope });
    assert.equal(invalid.scope.invalid, true);
    assert.ok(
      Object.values(invalid.records).every((rows) => rows.length === 0),
    );
    assert.equal(invalid.schedule.length, 0);
    assert.equal(invalid.decisions.length, 0);
  }
});

test("review decisions honor the effective route and exclude creators claimants and absent permission", () => {
  const state = fixture();
  const base = state.expenses[0];
  state.expenses.push(
    { ...base, id: "self-created", created_by: "manager" },
    {
      ...base,
      id: "self-claimed",
      meta: { ...base.meta, claimant_id: "manager" },
    },
    { ...base, id: "denied" },
    {
      ...base,
      id: "effective-other",
      effective_route: ["other", "manager"],
      meta: { ...base.meta, route: ["manager", "other"] },
    },
    {
      ...base,
      id: "effective-index",
      effective_route: ["other", "manager"],
      effective_approval_index: 1,
      meta: { ...base.meta, approvalIndex: 0 },
    },
    { ...base, id: "empty-route", effective_route: [] },
    { ...base, id: "draft", status: "draft" },
  );
  const view = derive(state, {
    ...options,
    can: (_resource, _action, record) => record?.id !== "denied",
  });
  assert.deepEqual(
    view.decisions
      .filter((row) => row.resource === "expenses")
      .map((row) => row.id),
    ["expense", "effective-index"],
  );
  assert.ok(
    view.decisions.every((row) => ["expense", "task"].includes(row.action)),
  );
  assert.equal(derive(state, { today: options.today }).decisions.length, 0);
  state.user.status = "suspended";
  assert.equal(derive(state, options).decisions.length, 0);
});

test("task review requires the current manager and view edit approve permissions and an open project", () => {
  const state = fixture();
  const base = state.tasks[1];
  state.tasks.push(
    {
      ...base,
      id: "wrong-manager",
      meta: { committee_id: "c2", reviewer_id: "manager" },
    },
    {
      ...base,
      id: "support-flow",
      meta: { committee_id: "c1", request: { stage: "delivered" } },
    },
    { ...base, id: "closed-task", project_id: "closed" },
  );
  assert.deepEqual(
    derive(state, options)
      .decisions.filter((row) => row.resource === "tasks")
      .map((row) => row.id),
    ["review"],
  );
  for (const denied of ["view", "edit", "approve"]) {
    const view = derive(state, {
      ...options,
      can: (resource, action) => resource !== "tasks" || action !== denied,
    });
    assert.equal(
      view.decisions.filter((row) => row.resource === "tasks").length,
      0,
    );
  }
});

test("schedule validates calendar dates excludes completed work and uses actual rental and warranty fields", () => {
  const state = fixture();
  for (const [id, due] of [
    ["invalid", "2026-02-30"],
    ["missing", ""],
    ["timestamp", "2026-09-16T08:00:00Z"],
  ])
    state.tasks.push({
      id,
      project_id: "p1",
      status: "todo",
      due,
      meta: { committee_id: "c1" },
    });
  state.assets.push(
    {
      id: "not-rented",
      ownership: "owned",
      meta: { rental_end: "2026-09-16" },
    },
    {
      id: "borrowed",
      ownership: "borrowed",
      meta: { rental_end: "2026-09-14" },
    },
  );
  const view = derive(state, options);
  assert.equal(view.counts.overdueTasks, 1);
  assert.equal(view.counts.dueTodayTasks, 2);
  assert.equal(view.counts.expiringRentals, 1);
  assert.equal(view.focus[0].id, "late");
  assert.ok(
    !view.schedule.some((row) =>
      [
        "invalid",
        "missing",
        "timestamp",
        "done",
        "closed",
        "not-rented",
      ].includes(row.id),
    ),
  );
  assert.equal(
    view.schedule.find((row) => row.id === "borrowed").overdue,
    true,
  );
  assert.equal(
    view.schedule.find(
      (row) => row.kind === "rental_end" && row.id === "asset1",
    ).upcoming,
    true,
  );
  assert.ok(view.schedule.some((row) => row.kind === "warranty_end"));
  assert.deepEqual(
    view.schedule.map((row) => row.date),
    [...view.schedule.map((row) => row.date)].sort(),
  );
});

test("workspace never reconstructs hidden money or mutates authorized server records", () => {
  const state = fixture();
  state.payments = [{ expense_id: "expense", amount: 990000 }];
  state.projects[0].meta = { previous_budget: 888000 };
  const before = structuredClone(state);
  const view = derive(state, options);
  const expense = view.decisions.find((row) => row.id === "expense");
  assert.equal(expense.record.amount_hidden, true);
  assert.equal(expense.record.amount, undefined);
  assert.equal(expense.record.paid, undefined);
  assert.equal(view.records.projects[0].budget, undefined);
  assert.ok(!JSON.stringify(view.counts).includes("990000"));
  assert.ok(!JSON.stringify(view.insights).includes("888000"));
  assert.deepEqual(state, before);
});

test("configured external services remain unverified and missing services remain pending", () => {
  const state = fixture();
  const view = derive(state, options);
  assert.equal(
    view.integrations.find((service) => service.id === "ai").status,
    "awaiting_configuration",
  );
  assert.equal(
    view.integrations.find((service) => service.id === "whatsapp").status,
    "configured_unverified",
  );
  state.integrations.whatsapp_status = "connected";
  assert.equal(
    derive(state, options).integrations.find(
      (service) => service.id === "whatsapp",
    ).status,
    "configured_unverified",
  );
  const empty = derive({}, options);
  assert.equal(empty.decisions.length, 0);
  assert.equal(empty.schedule.length, 0);
  assert.equal(empty.counts.progress, 0);
  assert.ok(
    empty.integrations.every(
      (service) => service.status === "awaiting_configuration",
    ),
  );
});

test("membership decisions require global user management and stay outside project or committee filters", () => {
  const state = fixture();
  state.members = [
    {
      id: "pending",
      name: "طلب انضمام",
      status: "pending",
      created: "2026-09-14T09:00:00Z",
    },
    { id: "active", name: "عضو مفعل", status: "active" },
    { id: "invited", name: "عضو مدعو", status: "invited" },
    { id: "suspended", name: "عضو موقوف", status: "suspended" },
  ];
  const decisions = derive(state, options).decisions.filter(
    (item) => item.resource === "users",
  );
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].id, "pending");
  assert.equal(decisions[0].title, "طلب انضمام");
  assert.equal(decisions[0].action, "user-edit");
  assert.equal(decisions[0].date, "2026-09-14");
  for (const scope of [{ project: "p1" }, { committee: "c1" }])
    assert.equal(
      derive(state, { ...options, ...scope }).decisions.filter(
        (item) => item.resource === "users",
      ).length,
      0,
    );
  for (const denied of ["view", "manage"])
    assert.equal(
      derive(state, {
        ...options,
        can: (resource, action) => resource !== "users" || action !== denied,
      }).decisions.filter((item) => item.resource === "users").length,
      0,
    );
  assert.equal(
    derive(state, {
      ...options,
      can: (_resource, _action, record) => record?.id !== "pending",
    }).decisions.filter((item) => item.resource === "users").length,
    0,
  );
});
