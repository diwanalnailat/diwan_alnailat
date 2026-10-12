import {
  RESOURCES,
  ACTIONS,
  RESOURCE_ACTIONS,
  automaticRoleGrants,
  committeeRoleContexts,
  grantMatches,
  isRoleBundle,
} from "./permission-policy.js";
export {
  RESOURCES,
  ACTIONS,
  RESOURCE_ACTIONS,
  PERMISSION_ALIASES,
} from "./permission-policy.js";
const validationError = (message) =>
  Object.assign(new Error(message), { status: 400 });
export const DEFAULT_SETTINGS = {
  name: "ديوان النائلات",
  description: "إرثٌ يجمعنا، وعملٌ يليق به.",
  timezone: "Asia/Riyadh",
  taskStatuses: [
    { id: "todo", name: "لم تبدأ", color: "#9c9e96", done: false },
    { id: "doing", name: "قيد التنفيذ", color: "#cab799", done: false },
    { id: "review", name: "بانتظار المراجعة", color: "#9e8bae", done: false },
    { id: "done", name: "مكتملة", color: "#75947c", done: true },
  ],
  priorities: [
    { id: "low", name: "منخفضة" },
    { id: "normal", name: "عادية" },
    { id: "high", name: "عالية" },
    { id: "urgent", name: "عاجلة" },
  ],
  categories: ["التجهيزات", "الضيافة", "الإعلام", "التشغيل", "النقل", "أخرى"],
  customFields: [],
  taskTemplates: [],
  permissionBundles: [],
  approval: { allowSelf: false, requireReceipt: false, route: [] },
  taskReview: { required: false, requireProof: false },
  notifications: { taskAssigned: true, taskDue: true, approval: true },
  guideTemplate: {
    name: "دليل تنفيذ المهمة",
    version: 1,
    approved: false,
    sections: [
      "الهدف والنتيجة المطلوبة",
      "المتطلبات السابقة",
      "خطوات التنفيذ",
      "قائمة التحقق",
      "إثبات الإنجاز",
      "التعثر والتواصل",
    ],
  },
};
export function parse(v, fallback = {}) {
  if (typeof v === "object" && v !== null) return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}
const grantList = (value) => {
  const list = parse(value, []);
  return Array.isArray(list)
    ? list.filter((g) => g && typeof g === "object" && !Array.isArray(g))
    : [];
};
const liveGrant = (g) =>
  !g.expires ||
  (Number.isFinite(Date.parse(g.expires)) &&
    Date.parse(g.expires) > Date.now());
export function effectiveGrants(u, bundles = []) {
  if (!u) return [];
  const manual = parse(u.bundles, []);
  return [
    ...grantList(u.grants),
    ...grantList(u.committeeGrants),
    {
      resource: "advances",
      action: "view",
      effect: "allow",
      scope: "assigned",
    },
    { resource: "profile", action: "view", effect: "allow", scope: "all" },
    { resource: "profile", action: "edit", effect: "allow", scope: "all" },
    { resource: "heritage", action: "view", effect: "allow", scope: "all" },
    { resource: "join_policy", action: "view", effect: "allow", scope: "all" },
    ...bundles
      .filter(
        (b) =>
          !isRoleBundle(b.id) && Array.isArray(manual) && manual.includes(b.id),
      )
      .flatMap((b) => grantList(b.grants)),
    ...automaticRoleGrants(u, bundles),
  ];
}
function assigned(u, record) {
  return (
    record &&
    (record.assignee_id === u.id ||
      record.created_by === u.id ||
      parse(record.meta).collaborators?.includes(u.id))
  );
}
function matchesScope(g, u, resource, record) {
  const scope = g.scope || "all";
  if (g.assignedOnly && !assigned(u, record)) return false;
  if (scope === "all") return true;
  if (!record) return false;
  if (scope === "committee")
    return (
      (record.committee_id ||
        parse(record.meta).committee_id ||
        ((resource === "committees" || g.resource === "committees") &&
          record.id)) === g.committeeId &&
      (!g.projectId || !record.project_id || record.project_id === g.projectId)
    );
  if (scope === "project")
    return (
      record.project_id === g.projectId ||
      ((resource === "projects" || g.resource === "projects") &&
        record.id === g.projectId)
    );
  if (scope === "assigned") return assigned(u, record);
  return false;
}
export function permitted(u, resource, action, record = null, bundles = []) {
  if (u?.status !== "active") return false;
  const gs = effectiveGrants(u, bundles).filter(
    (g) =>
      liveGrant(g) &&
      grantMatches(g, resource, action) &&
      matchesScope(g, u, resource, record),
  );
  return (
    !gs.some((g) => g.effect === "deny") && gs.some((g) => g.effect === "allow")
  );
}
export function maySeeModule(u, resource, bundles = []) {
  if (u?.status !== "active") return false;
  const grants = effectiveGrants(u, bundles).filter(
    (g) => liveGrant(g) && grantMatches(g, resource, "view"),
  );
  return (
    grants.some((g) => g.effect === "allow") &&
    !grants.some((g) => g.effect === "deny" && (g.scope || "all") === "all")
  );
}
export function money(v, zero = false) {
  const s = String(v ?? "").trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s))
    throw validationError("أدخل مبلغًا صحيحًا بمنزلتين عشريتين كحد أقصى");
  const [whole, decimal = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0 || (!zero && cents === 0))
    throw validationError("راجع قيمة المبلغ");
  return cents;
}
export function validDate(v, optional = false) {
  if (optional && !v) return null;
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v + "T00:00:00Z")) ||
    new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v
  )
    throw validationError("التاريخ غير صالح");
  return v;
}
export function string(v, max = 200, optional = false) {
  if (optional && !v) return "";
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    throw validationError("راجع الحقول المطلوبة وطول النص");
  return v.trim();
}
export function choice(v, allowed) {
  if (!allowed.includes(v)) throw validationError("قيمة غير متاحة");
  return v;
}
export function validateGrants(grants) {
  if (!Array.isArray(grants) || grants.length > 300)
    throw validationError("راجع مصفوفة الصلاحيات");
  for (const g of grants) {
    if (!g || typeof g !== "object" || Array.isArray(g))
      throw validationError("راجع قاعدة الصلاحية");
    if (
      g.resource !== "*" &&
      !Object.hasOwn(RESOURCES, g.resource) &&
      !["expenses.amount", "projects.budget", "users.phone"].includes(
        g.resource,
      )
    )
      throw validationError("نوع صلاحية غير صالح");
    if (g.action !== "*" && !Object.hasOwn(ACTIONS, g.action))
      throw validationError("إجراء غير صالح");
    const supported =
      RESOURCE_ACTIONS[g.resource] ||
      (["expenses.amount", "projects.budget", "users.phone"].includes(
        g.resource,
      )
        ? ["view"]
        : null);
    if (
      g.resource !== "*" &&
      g.action !== "*" &&
      !supported?.includes(g.action)
    )
      throw validationError("الإجراء غير متاح لهذا القسم");
    if (g.assignedOnly !== undefined && typeof g.assignedOnly !== "boolean")
      throw validationError("راجع تقييد الصلاحية بالسجلات المسندة");
    if (
      g.expires !== undefined &&
      (typeof g.expires !== "string" || !g.expires.trim())
    )
      throw validationError("راجع تاريخ انتهاء الصلاحية");
    choice(g.effect, ["allow", "deny"]);
    choice(g.scope || "all", ["all", "project", "committee", "assigned"]);
    if (g.scope === "project") string(g.projectId);
    if (g.scope === "committee") string(g.committeeId);
    if (g.expires && !Number.isFinite(Date.parse(g.expires)))
      throw validationError("راجع تاريخ انتهاء الصلاحية");
  }
  return grants;
}
export function fieldVisible(u, resource, field, record, bundles) {
  return !effectiveGrants(u, bundles).some(
    (g) =>
      g.resource === resource + "." + field &&
      g.effect === "deny" &&
      ["view", "*"].includes(g.action) &&
      liveGrant(g) &&
      matchesScope(g, u, resource, record),
  );
}

export function withCommittees(user, committees) {
  const committeeGrants = committees.flatMap((c) => {
    const membership = parse(c.members, []).find((m) => m.id === user.id);
    const related = membership || c.manager_id === user.id;
    return related
      ? [
          {
            resource: "committees",
            action: "view",
            effect: "allow",
            scope: "committee",
            committeeId: c.id,
          },
          ...[
            ...(c.manager_id === user.id
              ? ["view", "create", "edit", "assign", "approve", "export"]
                  .map((action) => ({
                    resource: "tasks",
                    action,
                    effect: "allow",
                  }))
                  .concat(
                    ["view", "create", "edit", "approve", "export"].map(
                      (action) => ({
                        resource: "expenses",
                        action,
                        effect: "allow",
                      }),
                    ),
                  )
              : membership
                ? ["view", "create", "edit"].map((action) => ({
                    resource: "expenses",
                    action,
                    effect: "allow",
                    assignedOnly: true,
                  }))
                : []),
            ...(membership?.grants || []),
          ].map((g) => ({
            ...g,
            scope: "committee",
            committeeId: c.id,
          })),
        ]
      : [];
  });
  return {
    ...user,
    roleContexts: committeeRoleContexts(user, committees),
    committeeGrants: [
      { resource: "assistant", action: "view", effect: "allow", scope: "all" },
      ...committeeGrants,
    ],
  };
}
export function taskStatuses(settings, committees, task) {
  return settings.taskStatuses;
}
