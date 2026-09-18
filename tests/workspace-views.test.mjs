import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const unsafe = '<img src=x onerror="alert(1)">';
function state() {
  return {
    user: { id: "manager", name: "عضو اختبار", status: "active" },
    modules: [
      "projects",
      "committees",
      "tasks",
      "expenses",
      "advances",
      "assets",
      "suppliers",
      "documents",
      "settings",
      "users",
      "assistant",
    ],
    settings: {
      taskStatuses: [
        { id: "todo", name: "بانتظار البدء", color: "#888", done: false },
        { id: "done", name: "مكتملة", color: "#080", done: true },
      ],
    },
    projects: [
      {
        id: "p1",
        title: "المشاركة الأولى",
        status: "active",
        due: "2026-09-20",
      },
      { id: "p2", title: "المشاركة الثانية", status: "active" },
    ],
    committees: [
      {
        id: "c1",
        project_id: "p1",
        manager_id: "manager",
        config: { second_approver_id: "other", budgetLines: [{ id: "line" }] },
      },
    ],
    tasks: [
      {
        id: "t1",
        project_id: "p1",
        title: unsafe,
        status: "review",
        due: "2026-09-15",
        assignee_id: "manager",
        meta: { committee_id: "c1" },
      },
      {
        id: "t2",
        project_id: "p2",
        title: "خارج المشروع",
        status: "doing",
        due: "2026-09-16",
        meta: {},
      },
    ],
    expenses: [
      {
        id: "e1",
        project_id: "p1",
        title: unsafe,
        status: "pending",
        created_by: "someone",
        effective_route: ["manager", "other"],
        effective_approval_index: 0,
        amount_hidden: true,
        meta: { committee_id: "c1", claimant_id: "someone" },
      },
    ],
    advances: [],
    assets: [
      {
        id: "asset",
        name: unsafe,
        serial: "NL-00000001",
        ownership: "rented",
        condition: "ready",
        available: 1,
        quantity: 1,
        meta: { rental_end: "2026-09-22" },
      },
    ],
    movements: [{ id: "movement", asset_id: "asset", project_id: "p1" }],
    suppliers: [],
    members: [],
    integrations: {},
  };
}
function fixture(t, overrides = {}) {
  const dom = new JSDOM('<main id="view"></main>', {
    runScripts: "outside-only",
    url: "https://diwan.test/",
  });
  t.after(() => dom.window.close());
  dom.window.eval(fs.readFileSync("public/workspace.js", "utf8"));
  dom.window.eval(fs.readFileSync("public/workspace-views.js", "utf8"));
  const context = {
    S: state(),
    project: "",
    committee: "",
    today: () => "2026-09-15",
    can: () => true,
    mayCreate: () => false,
    esc: escape,
    num: (value) => String(value),
    cash: (value) => (value === undefined ? "محجوب" : (value / 100).toFixed(2)),
    date: (value) => value,
    person: () => unsafe,
    projectName: (id) => (id === "p1" ? "المشاركة الأولى" : "المشاركة الثانية"),
    done: (record) => record.status === "done",
    icon: () => '<svg aria-hidden="true"></svg>',
    projectSelect: () => '<select id="projectFilter"></select>',
    committeeSelect: () => '<select id="committeeFilter"></select>',
    btn: (title, action, id = "", variant = "") =>
      `<button class="${escape(variant)}" data-action="${escape(action)}" data-id="${escape(id)}">${escape(title)}</button>`,
    heading: (title, subtitle, actions = "") =>
      `<header><h1>${escape(title)}</h1><p>${escape(subtitle)}</p>${actions}</header>`,
    expenseBreakdown: () => "",
    ...overrides,
  };
  const render = (page, changes = {}) => {
    const root = dom.window.document.querySelector("#view");
    root.innerHTML = dom.window.DiwanViews[page]({ ...context, ...changes });
    return root;
  };
  return { render, context };
}

test("decision view escapes record titles and opens only records assigned to the current reviewer", (t) => {
  const { render, context } = fixture(t, { project: "p1" });
  const root = render("decisions");
  assert.equal(root.querySelectorAll(".focus-row").length, 2);
  assert.equal(root.querySelectorAll("img,script,[onerror]").length, 0);
  assert.ok(root.textContent.includes(unsafe));
  assert.deepEqual(
    [...root.querySelectorAll(".focus-row")].map((row) => row.dataset.action),
    ["expense", "task"],
  );
  assert.equal(
    root.querySelectorAll(
      '[data-action="expense-approve"],[data-action="task-transition"]',
    ).length,
    0,
  );
  const taskOnly = render("decisions", { decisionFilter: "tasks" });
  assert.equal(taskOnly.querySelectorAll(".focus-row").length, 1);
  const denied = render("decisions", { can: () => false });
  assert.equal(denied.querySelectorAll(".focus-row").length, 0);
  assert.ok(denied.querySelector(".command-empty"));
  assert.equal(context.S.tasks[0].title, unsafe);
});

test("join requests render as safe member detail links only in the global decision view", (t) => {
  const { render, context } = fixture(t);
  context.S.members = [
    {
      id: "pending",
      name: unsafe,
      status: "pending",
      created: "2026-09-15T10:00:00Z",
    },
  ];
  const global = render("decisions", { decisionFilter: "users" });
  assert.equal(global.querySelectorAll(".focus-row").length, 1);
  assert.equal(global.querySelector(".focus-row").dataset.action, "user-edit");
  assert.equal(global.querySelectorAll("img,script,[onerror]").length, 0);
  const project = render("decisions", {
    project: "p1",
    decisionFilter: "users",
  });
  assert.equal(project.querySelectorAll(".focus-row").length, 0);
});

test("calendar applies project scope period filters and safe event links", (t) => {
  const { render, context } = fixture(t, { project: "p1" });
  const week = render("calendar");
  assert.deepEqual(
    [...week.querySelectorAll(".focus-row")].map((row) => row.dataset.id),
    ["t1", "p1", "asset"],
  );
  assert.equal(week.querySelectorAll("img,script,[onerror]").length, 0);
  assert.ok(!week.textContent.includes("خارج المشروع"));
  context.S.tasks[0].due = "2026-09-14";
  const overdue = render("calendar", { scheduleFilter: "overdue" });
  assert.deepEqual(
    [...overdue.querySelectorAll(".focus-row")].map((row) => row.dataset.id),
    ["t1"],
  );
  const empty = render("calendar", { project: "missing" });
  assert.ok(empty.querySelector(".command-empty"));
  assert.equal(empty.querySelectorAll(".focus-row").length, 0);
});

test("services reveal authorized modules and only permitted creation actions", (t) => {
  const { render, context } = fixture(t, {
    can: () => false,
    mayCreate: () => false,
  });
  context.S.modules = ["tasks", "assets"];
  const root = render("services");
  for (const action of [
    "task-new",
    "asset-new",
    "expense-new",
    "supplier-new",
    "user-new",
  ])
    assert.equal(root.querySelector(`[data-action="${action}"]`), null);
  assert.ok(root.querySelector('[data-action="asset-lookup"]'));
  assert.equal(root.querySelector('[data-page="expenses"]'), null);
  assert.equal(root.querySelector('[data-page="settings"]'), null);
  const finance = render("services", { serviceFilter: "finance" });
  assert.equal(finance.querySelector('[data-page="tasks"]'), null);
  assert.equal(finance.querySelector('[data-action="asset-lookup"]'), null);
  assert.ok(
    finance.querySelector(
      '[data-action="service-filter"][data-filter-value="finance"][aria-pressed="true"]',
    ),
  );
});

test("readiness service uses the server settings manage permission and a registered action", (t) => {
  const { render, context } = fixture(t);
  context.S.modules = ["settings"];
  const manager = render("services", {
    can: (resource, action) => resource === "settings" && action === "manage",
  });
  const button = [...manager.querySelectorAll("[data-action]")].find(
    (element) => element.textContent === "فحص الجاهزية",
  );
  assert.ok(
    button,
    "Settings managers should be able to open the readiness check",
  );
  const source = fs.readFileSync("public/app.js", "utf8");
  const registered = new Set(
    [...source.matchAll(/case\s+"([^"]+)"\s*:/g)].map((match) => match[1]),
  );
  assert.ok(
    registered.has(button.dataset.action),
    "Readiness must use an action handled by the real application",
  );
  const userManager = render("services", {
    can: (resource, action) => resource === "users" && action === "manage",
  });
  assert.equal(
    [...userManager.querySelectorAll("[data-action]")].find(
      (element) => element.textContent === "فحص الجاهزية",
    ),
    undefined,
  );
});

test("profile with hidden personal claims does not display a partial total or infer amounts", (t) => {
  const { render, context } = fixture(t);
  context.S.expenses = [
    {
      id: "hidden",
      project_id: "p1",
      title: unsafe,
      created_by: "manager",
      status: "approved",
      amount_hidden: true,
      meta: { claimant_id: "manager", funding_source: "personal" },
    },
    {
      id: "visible",
      project_id: "p1",
      title: "مصروف شخصي",
      created_by: "manager",
      status: "approved",
      amount: 65000,
      paid: 10000,
      meta: { claimant_id: "manager", funding_source: "personal" },
    },
    {
      id: "draft",
      project_id: "p1",
      title: unsafe,
      created_by: "manager",
      status: "draft",
      meta: { claimant_id: "manager" },
    },
  ];
  const before = structuredClone(context.S);
  const hidden = render("profile");
  assert.equal(hidden.querySelector(".personal-money").textContent, "محجوب");
  assert.ok(!hidden.textContent.includes("550.00"));
  assert.ok(!/NaN|undefined/.test(hidden.textContent));
  assert.equal(hidden.querySelectorAll("img,script,[onerror]").length, 0);
  assert.deepEqual(context.S, before);
  context.S.expenses = context.S.expenses.filter(
    (expense) => expense.id !== "hidden",
  );
  const visible = render("profile");
  assert.equal(
    visible.querySelector(".personal-money").textContent,
    "550.00 ريال",
  );
});

test("empty personal and decision workspaces describe their empty states without fictitious work", (t) => {
  const { render, context } = fixture(t);
  for (const key of [
    "projects",
    "committees",
    "tasks",
    "expenses",
    "advances",
    "assets",
    "movements",
  ])
    context.S[key] = [];
  for (const page of [
    "profile",
    "decisions",
    "calendar",
    "field",
    "overview",
  ]) {
    const root = render(page);
    assert.ok(root.querySelector(".command-empty"), page);
    assert.equal(root.querySelectorAll(".focus-row").length, 0, page);
    assert.ok(!/NaN|undefined/.test(root.textContent), page);
  }
});
