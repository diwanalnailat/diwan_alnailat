// One catalog drives server checks and the permissions editor. Aliases preserve
// existing grants while every new operation can be denied independently.
export const RESOURCES = {
  overview: "نظرة الديوان",
  projects: "المشاريع",
  committees: "اللجان",
  tasks: "المهام",
  expenses: "المصاريف",
  advances: "العهد المالية",
  suppliers: "الموردون",
  assets: "الأصول",
  documents: "الوثائق",
  users: "الأعضاء",
  join_requests: "طلبات الانضمام",
  join_policy: "سياسة الانضمام",
  settings: "الإعدادات",
  audit: "سجل العمليات",
  assistant: "سَنَد",
  services: "الخدمات",
  decisions: "القرارات",
  calendar: "التقويم",
  field: "الميدان",
  reports: "التقارير",
  media: "الإعلام",
  heritage: "واجهة الديوان",
  heritage_results: "نتائج المشاركة",
  permissions: "الصلاحيات",
  profile: "حسابي",
};
export const ACTIONS = {
  view: "مشاهدة",
  create: "إضافة",
  edit: "تعديل",
  assign: "إسناد",
  approve: "اعتماد",
  pay: "تسجيل سداد",
  export: "تصدير",
  archive: "أرشفة",
  manage: "إدارة",
  submit: "إرسال",
  review: "مراجعة",
  reject: "رفض",
  return: "إعادة",
  cancel: "إلغاء",
  comment: "تعليق",
  upload: "رفع مرفق",
  download: "تنزيل",
  delete: "حذف",
  issue: "تسليم",
  consume: "استهلاك",
};
const files = ["upload", "download"];
export const RESOURCE_ACTIONS = {
  overview: ["view"],
  services: ["view"],
  decisions: ["view"],
  calendar: ["view"],
  field: ["view"],
  reports: ["view", "export"],
  media: ["view", "create", "edit", "export"],
  heritage: ["view"],
  heritage_results: ["view", "manage"],
  profile: ["view", "edit"],
  permissions: ["view", "manage"],
  join_policy: ["view", "manage"],
  committees: ["view", "create", "edit", "manage"],
  projects: ["view", "create", "edit", "archive", "export"],
  tasks: [
    "view",
    "create",
    "edit",
    "assign",
    "submit",
    "review",
    "approve",
    "return",
    "comment",
    "export",
    ...files,
  ],
  expenses: [
    "view",
    "create",
    "edit",
    "submit",
    "review",
    "approve",
    "return",
    "reject",
    "cancel",
    "pay",
    "manage",
    "export",
    ...files,
  ],
  advances: ["view", "create", "pay", "export", ...files],
  suppliers: ["view", "create", "edit", "export", ...files],
  assets: [
    "view",
    "create",
    "edit",
    "assign",
    "issue",
    "return",
    "consume",
    "export",
    ...files,
  ],
  documents: ["view", "create", "edit", "export", ...files],
  users: ["view", "manage"],
  join_requests: ["view", "approve", "review", "reject", "manage"],
  settings: ["view", "manage"],
  audit: ["view", "export"],
  assistant: ["view", "create", "delete"],
};
export const PERMISSION_ALIASES = {
  "committees:manage": ["users:manage"],
  "permissions:view": ["users:manage"],
  "permissions:manage": ["users:manage"],
  "join_policy:view": ["users:manage"],
  "join_policy:manage": ["users:manage"],
  "heritage_results:view": ["settings:manage"],
  "heritage_results:manage": ["settings:manage"],
  "overview:view": ["projects:view", "tasks:view", "expenses:view"],
  "services:view": ["assets:view", "suppliers:view"],
  "decisions:view": ["tasks:approve", "expenses:approve"],
  "calendar:view": ["tasks:view"],
  "field:view": ["tasks:view", "assets:view"],
  "reports:view": [
    "projects:export",
    "tasks:export",
    "expenses:export",
    "advances:export",
    "assets:export",
  ],
  "reports:export": [
    "suppliers:export",
    "documents:export",
    "audit:export",
    "media:export",
    "projects:export",
    "tasks:export",
    "expenses:export",
    "advances:export",
    "assets:export",
  ],
  "media:view": ["suppliers:view"],
  "media:create": ["suppliers:create"],
  "media:edit": ["suppliers:edit"],
  "media:export": ["suppliers:export"],
  "expenses:submit": ["expenses:create", "expenses:edit"],
  "expenses:review": ["expenses:approve"],
  "expenses:return": ["expenses:approve"],
  "expenses:reject": ["expenses:approve"],
  "expenses:cancel": ["expenses:edit"],
  "tasks:submit": ["tasks:edit"],
  "tasks:review": ["tasks:approve"],
  "tasks:return": ["tasks:approve"],
  "tasks:comment": ["tasks:edit"],
  "join_requests:review": ["join_requests:approve"],
  "join_requests:reject": ["join_requests:approve"],
  "assets:issue": ["assets:assign"],
  "assets:return": ["assets:assign"],
  "assets:consume": ["assets:assign"],
  "assistant:delete": ["assistant:view"],
};
for (const [resource, actions] of Object.entries(RESOURCE_ACTIONS)) {
  if (actions.includes("download"))
    PERMISSION_ALIASES[resource + ":download"] = [resource + ":view"];
  if (actions.includes("upload"))
    PERMISSION_ALIASES[resource + ":upload"] = ["create", "edit"]
      .filter((action) => actions.includes(action))
      .map((action) => resource + ":" + action);
}
PERMISSION_ALIASES["advances:upload"].push("advances:pay");
const decode = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const label = (value) =>
  typeof value === "string"
    ? value.normalize("NFC").trim().replace(/\s+/g, " ")
    : "";
export const isRoleBundle = (id) =>
  typeof id === "string" && id.startsWith("role:");
export function roleId(kind, value) {
  return (
    "role:" +
    kind +
    (value === undefined ? "" : ":" + encodeURIComponent(label(value)))
  );
}
const fixedRoles = [
  ["committee-manager", "مدير اللجنة"],
  ["committee-member", "عضو اللجنة"],
  ["committee-supervisor", "مشرف اللجنة"],
  ["expense-approver", "المعتمد الثاني للمصاريف"],
  ["expense-delegate", "بديل الاعتماد عند تعارض المصالح"],
];
export function permissionRoles(
  committees = [],
  members = [],
  bundles = [],
  titles = [],
) {
  const rows = new Map(
    fixedRoles.map(([id, name]) => [
      roleId(id),
      { id: roleId(id), name, scope: "committee" },
    ]),
  );
  const addTitle = (title) => {
    if (label(title))
      rows.set(roleId("member-title", title), {
        id: roleId("member-title", title),
        name: label(title),
        scope: "committee",
      });
  };
  titles.forEach(addTitle);
  for (const committee of committees)
    for (const membership of decode(committee.members, []) || [])
      addTitle(membership.title);
  for (const member of members) {
    const team = label(member.team);
    if (team)
      rows.set(roleId("team", team), {
        id: roleId("team", team),
        name: team,
        scope: "all",
      });
  }
  // Existing templates remain editable even when their last assignment is gone.
  for (const bundle of bundles.filter((b) => isRoleBundle(b.id))) {
    if (!rows.has(bundle.id) && /^role:(member-title|team):/.test(bundle.id))
      rows.set(bundle.id, {
        id: bundle.id,
        name: bundle.name || bundle.id,
        scope: bundle.id.startsWith("role:team:") ? "all" : "committee",
      });
  }
  return [...rows.values()].map((row) => {
    const saved = bundles.find((b) => b.id === row.id);
    return {
      ...row,
      grants: decode(saved?.grants, []) || [],
      version: saved?.version || 0,
    };
  });
}
export function committeeRoleContexts(user, committees = []) {
  const contexts = [];
  for (const c of committees) {
    const m = (decode(c.members, []) || []).find((m) => m.id === user.id),
      cfg = decode(c.config, {}) || {};
    const add = (id) =>
      contexts.push({
        roleId: id,
        scope: "committee",
        committeeId: c.id,
        projectId: c.project_id,
      });
    if (c.manager_id === user.id) add(roleId("committee-manager"));
    if (m?.role === "member") add(roleId("committee-member"));
    if (m?.role === "supervisor") add(roleId("committee-supervisor"));
    if (m?.title) add(roleId("member-title", m.title));
    if (cfg.second_approver_id === user.id) add(roleId("expense-approver"));
    if (cfg.review_delegate_id === user.id) add(roleId("expense-delegate"));
  }
  return contexts;
}
export function automaticRoleGrants(user, bundles = []) {
  const contexts = [...(user.roleContexts || [])];
  if (label(user.team))
    contexts.push({ roleId: roleId("team", user.team), scope: "all" });
  return contexts.flatMap((context) => {
    const bundle = bundles.find((b) => b.id === context.roleId);
    const grants = decode(bundle?.grants, []);
    if (!Array.isArray(grants)) return [];
    return grants.flatMap((grant) => {
      if (!grant || typeof grant !== "object") return [];
      if (context.scope === "all")
        return [{ ...grant, roleId: context.roleId }];
      const scope = grant.scope || "all";
      if (scope === "committee" && grant.committeeId !== context.committeeId)
        return [];
      if (scope === "project" && grant.projectId !== context.projectId)
        return [];
      if (!["all", "assigned", "project", "committee"].includes(scope))
        return [];
      return [
        {
          ...grant,
          scope: "committee",
          committeeId: context.committeeId,
          projectId: context.projectId,
          assignedOnly: grant.assignedOnly === true || scope === "assigned",
          roleId: context.roleId,
        },
      ];
    });
  });
}
export function grantMatches(grant, resource, action) {
  return [
    [resource, action],
    ...(PERMISSION_ALIASES[resource + ":" + action] || []).map((pair) =>
      pair.split(":"),
    ),
  ].some(
    ([r, a]) =>
      (grant.resource === "*" || grant.resource === r) &&
      (grant.action === "*" || grant.action === a),
  );
}
