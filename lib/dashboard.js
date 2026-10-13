import { parse } from "./domain.js";

// Recomputed from current membership and permissions, never from a client role.
export function dashboardScope(c) {
  const committees = c.committees.filter(
    (committee) =>
      c.can("committees", "view", committee) &&
      (committee.manager_id === c.u.id ||
        parse(committee.members, []).some((m) =>
          m.id === c.u.id && ["manager", "supervisor"].includes(m.role))),
  );
  return {
    role:
      c.can("users", "manage") || c.can("settings", "manage")
        ? "admin"
        : committees.length
          ? "supervisor"
          : "member",
    committee_ids: committees.map((committee) => committee.id),
  };
}
export function dashboardReadScope(table, dashboard, memberId) {
  if (dashboard.role === "member") {
    if (table === "nl_tasks")
      return { sql: "(assignee_id=? OR json_extract(meta,'$.reviewer_id')=?)", args: [memberId, memberId] };
    if (table === "nl_advances")
      return { sql: "assignee_id=?", args: [memberId] };
    if (table === "nl_expenses")
      return {
        sql: "(created_by=? OR json_extract(meta,'$.claimant_id')=?)",
        args: [memberId, memberId],
      };
  }
  if (
    dashboard.role === "supervisor" &&
    ["nl_tasks", "nl_expenses"].includes(table)
  )
    return {
      sql: `json_extract(meta,'$.committee_id') IN (${dashboard.committee_ids.map(() => "?").join(",")})`,
      args: dashboard.committee_ids,
    };
  return { sql: "", args: [] };
}
