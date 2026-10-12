import test from "node:test";
import assert from "node:assert/strict";
import {
  permitted,
  maySeeModule,
  effectiveGrants,
  fieldVisible,
  validateGrants,
  withCommittees,
} from "../lib/domain.js";
import {
  RESOURCES,
  RESOURCE_ACTIONS,
  PERMISSION_ALIASES,
  permissionRoles,
  roleId,
} from "../lib/permission-policy.js";

const grant = (resource, action, effect = "allow", extra = {}) => ({
  resource,
  action,
  effect,
  scope: "all",
  ...extra,
});
const user = (extra = {}) => ({
  id: "person",
  status: "active",
  grants: [],
  bundles: [],
  ...extra,
});
const committee = (id, extra = {}) => ({
  id,
  project_id: "project-" + id,
  manager_id: null,
  members: [],
  config: {},
  ...extra,
});
const row = (id, extra = {}) => ({
  committee_id: id,
  project_id: "project-" + id,
  assignee_id: "person",
  ...extra,
});
const template = (kind, grants, value) => ({
  id: roleId(kind, value),
  grants,
  version: 1,
});

test("catalog exposes granular actions with directional legacy fallback and deny precedence", () => {
  for (const resource of [
    "overview",
    "services",
    "decisions",
    "calendar",
    "field",
    "reports",
    "media",
    "join_policy",
    "heritage",
    "heritage_results",
    "permissions",
    "profile",
  ])
    assert.ok(RESOURCES[resource]);
  for (const action of [
    "submit",
    "review",
    "reject",
    "cancel",
    "pay",
    "upload",
    "download",
  ])
    assert.ok(RESOURCE_ACTIONS.expenses.includes(action));
  const old = user({
    grants: [grant("expenses", "edit"), grant("expenses", "approve")],
  });
  for (const action of ["submit", "cancel", "review", "reject", "return"])
    assert.equal(permitted(old, "expenses", action), true);
  old.grants.push(grant("expenses", "reject", "deny"));
  assert.equal(permitted(old, "expenses", "reject"), false);
  assert.equal(
    permitted(old, "expenses", "return"),
    true,
    "a granular deny does not deny an unrelated sibling operation",
  );
  old.grants.push(grant("expenses", "approve", "deny"));
  assert.equal(
    permitted(old, "expenses", "review"),
    false,
    "a denied legacy capability cannot be revived through its alias",
  );
  const granular = user({ grants: [grant("expenses", "reject")] });
  assert.equal(permitted(granular, "expenses", "approve"), false);
  assert.equal(
    permitted(
      user({ grants: [grant("expenses", "create")] }),
      "expenses",
      "submit",
    ),
    true,
  );
  assert.equal(
    permitted(
      user({ grants: [grant("advances", "pay")] }),
      "advances",
      "upload",
    ),
    true,
  );
  assert.equal(permitted(user(), "heritage", "view"), true);
  assert.equal(
    permitted(
      user({ grants: [grant("heritage", "view", "deny")] }),
      "heritage",
      "view",
    ),
    false,
  );
  assert.deepEqual(PERMISSION_ALIASES["permissions:view"], ["users:manage"]);
  assert.equal(
    permitted(
      user({ grants: [grant("users", "view")] }),
      "permissions",
      "view",
    ),
    false,
  );
  const admin = user({
    grants: [grant("users", "manage"), grant("permissions", "manage", "deny")],
  });
  assert.equal(permitted(admin, "permissions", "view"), true);
  assert.equal(permitted(admin, "permissions", "manage"), false);
});

test("automatic committee templates stay contextual, intersect their scope, and respect all denies", () => {
  const a = committee("a", { manager_id: "person" }),
    b = committee("b");
  const scoped = withCommittees(user(), [a, b]);
  const bundles = [
    template("committee-manager", [
      grant("tasks", "create", "deny"),
      grant("documents", "create"),
    ]),
  ];
  assert.equal(permitted(scoped, "tasks", "create", row("a"), bundles), false);
  assert.equal(
    permitted(scoped, "tasks", "approve", row("a"), bundles),
    true,
    "unmodified legacy role defaults are inherited",
  );
  assert.equal(
    permitted(scoped, "documents", "create", row("a"), bundles),
    true,
  );
  assert.equal(
    permitted(scoped, "documents", "create", row("b"), bundles),
    false,
  );
  assert.equal(
    permitted(scoped, "documents", "create", null, bundles),
    false,
    "committee template cannot become global",
  );
  bundles[0].grants = [
    grant("documents", "create", "allow", {
      scope: "project",
      projectId: "project-b",
    }),
  ];
  assert.equal(
    permitted(scoped, "documents", "create", row("a"), bundles),
    false,
    "scope outside automatic role is discarded",
  );
  bundles[0].grants = [
    grant("documents", "create", "allow", { scope: "assigned" }),
  ];
  assert.equal(
    permitted(scoped, "documents", "create", row("a"), bundles),
    true,
  );
  assert.equal(
    permitted(
      scoped,
      "documents",
      "create",
      row("a", { assignee_id: "other" }),
      bundles,
    ),
    false,
  );
  const directDeny = {
    ...scoped,
    grants: [grant("documents", "create", "deny")],
  };
  assert.equal(
    permitted(directDeny, "documents", "create", row("a"), bundles),
    false,
  );
});

test("multiple current roles, custom titles and teams resolve without manual reserved-bundle escalation", () => {
  const a = committee("a", {
    members: [{ id: "person", role: "member", title: " منسق   موقع " }],
    config: { second_approver_id: "person" },
  });
  const b = committee("b", { config: { review_delegate_id: "person" } });
  const bundles = [
    template("member-title", [grant("tasks", "assign")], "منسق موقع"),
    template("expense-approver", [grant("expenses", "approve")]),
    template("expense-delegate", [grant("expenses", "approve")]),
    template("team", [grant("reports", "view")], "التشغيل"),
  ];
  const scoped = withCommittees(user({ team: "التشغيل" }), [a, b]);
  assert.equal(
    permitted(scoped, "expenses", "create", row("b")),
    false,
    "reviewer role without membership does not imply expense creation",
  );
  assert.equal(permitted(scoped, "tasks", "assign", row("a"), bundles), true);
  assert.equal(permitted(scoped, "tasks", "assign", row("b"), bundles), false);
  for (const id of ["a", "b"])
    assert.equal(
      permitted(scoped, "expenses", "approve", row(id), bundles),
      true,
    );
  assert.equal(permitted(scoped, "reports", "view", null, bundles), true);
  const forged = user({ bundles: bundles.map((b) => b.id) });
  assert.equal(permitted(forged, "reports", "view", null, bundles), false);
  assert.equal(
    permitted(forged, "expenses", "approve", row("a"), bundles),
    false,
  );
  const reassigned = withCommittees(scoped, [committee("a"), committee("b")]);
  assert.equal(
    permitted(reassigned, "expenses", "approve", row("a"), bundles),
    false,
  );
  const inactive = { ...scoped, status: "suspended" };
  assert.equal(permitted(inactive, "reports", "view", null, bundles), false);
  assert.equal(maySeeModule(inactive, "reports", bundles), false);
  const roles = permissionRoles([a, b], [scoped], bundles, [
    "منسق موقع",
    "منسق  موقع",
  ]);
  assert.equal(
    roles.filter((r) => r.id === roleId("member-title", "منسق موقع")).length,
    1,
  );
  assert.equal(
    roles.find((r) => r.id === roleId("team", "التشغيل")).scope,
    "all",
  );
  assert.ok(
    effectiveGrants(scoped, bundles)
      .filter((g) => g.roleId === roleId("expense-approver"))
      .every((g) => g.scope === "committee" && g.committeeId === "a"),
  );
});

test("expiry and field restrictions apply to automatic templates and malformed rules fail validation", () => {
  const scoped = withCommittees(user(), [
    committee("a", { manager_id: "person" }),
  ]);
  const bundles = [
    template("committee-manager", [
      grant("tasks", "view", "deny", { expires: "2000-01-01T00:00:00Z" }),
      grant("expenses.amount", "view", "deny"),
    ]),
  ];
  assert.equal(permitted(scoped, "tasks", "view", row("a"), bundles), true);
  assert.equal(
    fieldVisible(scoped, "expenses", "amount", row("a"), bundles),
    false,
  );
  assert.equal(
    fieldVisible(scoped, "expenses", "amount", row("b"), bundles),
    true,
  );
  for (const rule of [
    null,
    [],
    {},
    grant("__proto__", "*"),
    grant("tasks", "constructor"),
    grant("audit", "pay"),
    grant("tasks", "view", "allow", { scope: "committee" }),
    grant("tasks", "view", "allow", { assignedOnly: "false" }),
    grant("tasks", "view", "allow", { expires: "not-a-date" }),
  ])
    assert.throws(
      () => validateGrants([rule]),
      (e) => e.status === 400,
    );
  assert.doesNotThrow(() =>
    validateGrants([
      grant("*", "*"),
      grant("expenses.amount", "view", "deny"),
      grant("expenses", "cancel"),
    ]),
  );
});
