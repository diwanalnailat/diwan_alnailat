import { parse, permitted, withCommittees } from "./domain.js";
import { committeeConfig } from "./governance.js";

// Revalidate the current assignment, never trust notification text as authority.
export async function personInvitationEligible(
  db,
  invite,
  member,
  snapshots = [],
) {
  if (
    !invite ||
    !member ||
    member.status !== "active" ||
    member.phone !== invite.phone ||
    invite.used ||
    invite.expires <= Date.now()
  )
    return false;
  const [purpose, memberId, resource, id, role] = invite.site_id.split(":");
  if (purpose !== "person" || member.id !== memberId) return false;
  const tables = {
    committees: "nl_committees",
    tasks: "nl_tasks",
    advances: "nl_advances",
    assets: "nl_assets",
    documents: "nl_guides",
    join_requests: "nl_join_requests",
  };
  if (!tables[resource]) return false;
  const entity = await db
    .prepare(`SELECT * FROM ${tables[resource]} WHERE id=?`)
    .bind(id)
    .first();
  if (!entity) return false;
  snapshots.push(
    { table: tables[resource], id: entity.id, version: entity.version },
    { table: "nl_members", id: member.id, version: member.version },
  );
  if (entity.project_id) {
    const p = await db
      .prepare("SELECT id,status,version FROM nl_projects WHERE id=?")
      .bind(entity.project_id)
      .first();
    if (!p || p.status === "closed") return false;
    snapshots.push({ table: "nl_projects", id: p.id, version: p.version });
  }
  const committees = (await db.prepare("SELECT * FROM nl_committees").all())
    .results;
  const committeeId = entity.committee_id || parse(entity.meta).committee_id;
  const committee = committees.find((k) => k.id === committeeId);
  if (committee)
    snapshots.push({
      table: "nl_committees",
      id: committee.id,
      version: committee.version,
    });
  if (!entity.project_id && committee) {
    const project = await db
      .prepare("SELECT id,status,version FROM nl_projects WHERE id=?")
      .bind(committee.project_id)
      .first();
    if (!project || project.status === "closed") return false;
    snapshots.push({
      table: "nl_projects",
      id: project.id,
      version: project.version,
    });
  }
  const bundles = (await db.prepare("SELECT * FROM nl_bundles").all()).results;
  const recipient = withCommittees(member, committees);
  if (resource === "committees") {
    const cfg = committeeConfig(entity),
      membership = parse(entity.members, []).find((m) => m.id === memberId);
    const assigned =
      role === "manager"
        ? entity.manager_id === memberId
        : role === "approver"
          ? cfg.second_approver_id === memberId
          : role === "delegate"
            ? cfg.review_delegate_id === memberId
            : role === "supervisor"
              ? membership?.role === "supervisor"
              : role === "member" && !!membership;
    return (
      assigned &&
      permitted(recipient, "committees", "view", entity, bundles) &&
      (!["approver", "delegate"].includes(role) ||
        ["view", "approve"].every((a) =>
          permitted(
            recipient,
            "expenses",
            a,
            { project_id: entity.project_id, committee_id: id },
            bundles,
          ),
        ))
    );
  }
  if (resource === "tasks")
    return (
      (role === "assignee"
        ? entity.assignee_id === memberId
        : role === "participant" &&
          parse(entity.meta).collaborators?.includes(memberId)) &&
      permitted(recipient, "tasks", "view", entity, bundles)
    );
  if (resource === "advances")
    return (
      entity.assignee_id === memberId &&
      permitted(recipient, "advances", "view", entity, bundles)
    );
  if (resource === "documents")
    return (
      role === "proposed" && parse(entity.content).assignee_id === memberId
    );
  if (resource === "join_requests")
    return (
      entity.assigned_to === memberId &&
      entity.status === "referred" &&
      committees.some(
        (k) =>
          k.id === entity.committee_id &&
          parse(k.members, []).some(
            (m) =>
              m.id === memberId && ["manager", "supervisor"].includes(m.role),
          ),
      ) &&
      permitted(
        recipient,
        "committees",
        "view",
        {
          id: entity.committee_id,
          committee_id: entity.committee_id,
          project_id: entity.project_id,
        },
        bundles,
      )
    );
  const notice = await db
    .prepare(
      "SELECT project_id FROM nl_notifications WHERE id=? AND member_id=?",
    )
    .bind(invite.id, memberId)
    .first();
  if (!notice) return false;
  if (notice.project_id) {
    const project = await db
      .prepare("SELECT id,status,version FROM nl_projects WHERE id=?")
      .bind(notice.project_id)
      .first();
    if (!project || project.status === "closed") return false;
    snapshots.push({
      table: "nl_projects",
      id: project.id,
      version: project.version,
    });
  }
  const custody =
    "(SELECT COALESCE(SUM(CASE WHEN type IN ('issue','consume') THEN quantity WHEN type='return' THEN -quantity ELSE 0 END),0) FROM nl_movements WHERE asset_id=? AND member_id=?)>0";
  if (
    !(await db
      .prepare("SELECT id FROM nl_assets WHERE id=? AND " + custody)
      .bind(id, id, memberId)
      .first())
  )
    return false;
  snapshots.push({
    table: "nl_assets",
    id,
    version: entity.version,
    guardSql: " AND " + custody,
    guardArgs: [id, memberId],
  });
  // Custody authorizes this receipt invitation, not general asset visibility.
  // Evaluate the established deny rules against that narrow relationship.
  return permitted(
    {
      ...recipient,
      grants: [
        ...parse(recipient.grants, []),
        {
          resource: "assets",
          action: "view",
          effect: "allow",
          scope: "assigned",
        },
      ],
    },
    "assets",
    "view",
    { ...entity, assignee_id: memberId, project_id: notice.project_id },
    bundles,
  );
}
