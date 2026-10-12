import { parse, permitted } from "./domain.js";

// Inherited task/author access is a grant, never a bypass of explicit denials.
export function canDocument(c, action, guide, task = null) {
  const record = {
    ...guide,
    committee_id: guide.committee_id || parse(task?.meta).committee_id,
  };
  const inherited =
    action === "view"
      ? (task && c.can("tasks", "view", task)) ||
        (guide.created_by === c.u.id && c.can("assistant", "view", record))
      : action === "export"
        ? task && c.can("tasks", "export", task)
        : ["create", "edit"].includes(action) &&
          guide.created_by === c.u.id &&
          c.can("assistant", "create", record);
  return permitted(
    {
      ...c.u,
      grants: [
        ...parse(c.u.grants, []),
        ...(inherited
          ? [{ resource: "documents", action, effect: "allow", scope: "all" }]
          : []),
      ],
    },
    "documents",
    action,
    record,
    c.bundles,
  );
}
