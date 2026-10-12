import {
  ACTIONS,
  RESOURCES,
  RESOURCE_ACTIONS,
  parse,
  withCommittees,
  permitted,
  effectiveGrants,
} from "./domain.js";
import {
  PERMISSION_ALIASES,
  permissionRoles,
  isRoleBundle,
} from "./permission-policy.js";

export function permissionCatalog(c, members, titles = []) {
  return {
    resources: RESOURCES,
    actions: ACTIONS,
    resource_actions: RESOURCE_ACTIONS,
    aliases: PERMISSION_ALIASES,
    roles: permissionRoles(c.committees, members, c.bundles, titles),
    bundles: c.bundles
      .filter((b) => !isRoleBundle(b.id))
      .map((b) => ({ ...b, grants: parse(b.grants, []) })),
    users: members.map(({ id, name, team, status, grants, version }) => ({
      id,
      name,
      team,
      status,
      grants: parse(grants, []),
      version,
    })),
    can_manage: c.can("permissions", "manage"),
  };
}

export function previewPermissions(c, member, grants, roleId = null) {
  const bundles = roleId
    ? [...c.bundles.filter((b) => b.id !== roleId), { id: roleId, grants }]
    : c.bundles;
  const user = withCommittees(
    roleId ? member : { ...member, grants },
    c.committees,
  );
  const scopes = [
    { name: "كل المنصة", record: null },
    {
      name: "سجلات المستخدم",
      record: { created_by: user.id, assignee_id: user.id },
    },
    ...c.projectRows
      .filter((p) => c.can("projects", "view", p))
      .map((p) => ({
        name: p.title,
        record: { id: p.id, project_id: p.id },
      })),
    ...c.committees
      .filter((k) => c.can("committees", "view", k))
      .flatMap((k) => [
        {
          name: k.name,
          record: { id: k.id, project_id: k.project_id, committee_id: k.id },
        },
        {
          name: k.name + " · سجلات المستخدم",
          record: {
            id: k.id,
            project_id: k.project_id,
            committee_id: k.id,
            created_by: user.id,
            assignee_id: user.id,
          },
        },
      ]),
  ];
  const access = scopes.flatMap((scope) =>
    Object.entries(RESOURCE_ACTIONS).flatMap(([resource, actions]) => {
      const allowed = actions.filter((action) =>
        permitted(user, resource, action, scope.record, bundles),
      );
      return allowed.length
        ? [
            {
              resource,
              name: RESOURCES[resource],
              scope: scope.name,
              actions: allowed.map((a) => ACTIONS[a]),
            },
          ]
        : [];
    }),
  );
  const effective = effectiveGrants(user, bundles);
  return {
    access,
    effective_grants: effective,
    restrictions: effective
      .filter(
        (g) =>
          g.effect === "deny" &&
          (!g.expires || Date.parse(g.expires) > Date.now()),
      )
      .map(
        (g) =>
          `${RESOURCES[g.resource] || g.resource} · ${ACTIONS[g.action] || "كل الإجراءات"}`,
      ),
  };
}
