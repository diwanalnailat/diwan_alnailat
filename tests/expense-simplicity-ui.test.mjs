import { test } from "node:test";
import assert from "node:assert/strict";
import "../public/workspace.js";

test("committee readiness depends on its approvers rather than historical spending catalogs", () => {
  const state = {
    user: { id: "admin", status: "active" },
    projects: [{ id: "project", title: "المشاركة", status: "active" }],
    committees: [
      {
        id: "without-catalog",
        project_id: "project",
        manager_id: "manager",
        config: { second_approver_id: "reviewer" },
      },
      {
        id: "empty-catalog",
        project_id: "project",
        manager_id: "manager",
        config: { second_approver_id: "reviewer", budgetLines: [] },
      },
      {
        id: "historical",
        project_id: "project",
        manager_id: "manager",
        config: {
          second_approver_id: "reviewer",
          budgetLines: [{ id: "old", name: "تصنيف سابق", budget: 5000 }],
        },
      },
    ],
  };
  const options = { today: "2026-10-13", can: () => true };
  const original = structuredClone(state.committees);
  const result = globalThis.DiwanWorkspace.derive(state, options);
  assert.equal(
    result.insights.some((item) => item.id === "committees"),
    false,
  );
  assert.deepEqual(
    state.committees,
    original,
    "readiness must not rewrite historical catalogs",
  );
  state.committees[0].config.second_approver_id = null;
  const warning = globalThis.DiwanWorkspace.derive(
    state,
    options,
  ).insights.find((item) => item.id === "committees");
  assert.equal(warning.count, 1, "missing approver still requires setup");
  assert.equal(warning.note.includes("بنود"), false);
});
