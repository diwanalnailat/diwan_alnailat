const validationError = (message) =>
  Object.assign(new Error(message), { status: 400 });
export const RESOURCES = {
  projects: "المشاريع",
  committees: "اللجان",
  tasks: "المهام",
  expenses: "المصاريف",
  advances: "العهد المالية",
  suppliers: "الموردون",
  assets: "الأصول",
  documents: "الوثائق",
  users: "الأعضاء",
  settings: "الإعدادات",
  audit: "سجل العمليات",
  assistant: "المساعد",
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
};
export const RESOURCE_ACTIONS = {
  committees: ["view", "create", "edit", "manage"],
  projects: ["view", "create", "edit", "archive", "export"],
  tasks: ["view", "create", "edit", "assign", "approve", "export"],
  advances: ["view", "create", "pay", "export"],
  expenses: ["view", "create", "edit", "approve", "pay", "export"],
  suppliers: ["view", "create", "edit", "export"],
  assets: ["view", "create", "edit", "assign", "export"],
  documents: ["view", "create", "export"],
  users: ["view", "manage"],
  settings: ["view", "manage"],
  audit: ["view", "export"],
  assistant: ["view", "create"],
};
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
export function effectiveGrants(u, bundles = []) {
  return [
    ...parse(u.grants, []),
    ...(u.committeeGrants || []),
    {
      resource: "advances",
      action: "view",
      effect: "allow",
      scope: "assigned",
    },
    ...bundles
      .filter((b) => parse(u.bundles, []).includes(b.id))
      .flatMap((b) => parse(b.grants, [])),
  ];
}
export function permitted(u, resource, action, record = null, bundles = []) {
  if (u?.status !== "active") return false;
  const gs = effectiveGrants(u, bundles).filter((g) => {
    if (g.expires && Date.parse(g.expires) < Date.now()) return false;
    if (g.resource !== "*" && g.resource !== resource) return false;
    if (g.action !== "*" && g.action !== action) return false;
    const scope = g.scope || "all";
    if (scope === "all") return true;
    if (!record) return false;
    if (scope === "committee")
      return (
        (record.committee_id ||
          parse(record.meta).committee_id ||
          (resource === "committees" && record.id)) === g.committeeId &&
        (!g.assignedOnly ||
          record.assignee_id === u.id ||
          record.created_by === u.id ||
          parse(record.meta).collaborators?.includes(u.id))
      );
    if (scope === "project")
      return (
        record.project_id === g.projectId ||
        (resource === "projects" && record.id === g.projectId)
      );
    if (scope === "assigned")
      return (
        record.assignee_id === u.id ||
        record.created_by === u.id ||
        parse(record.meta).collaborators?.includes(u.id)
      );
    return false;
  });
  return (
    !gs.some((g) => g.effect === "deny") && gs.some((g) => g.effect === "allow")
  );
}
export function maySeeModule(u, resource, bundles = []) {
  return (
    effectiveGrants(u, bundles).some(
      (g) =>
        g.effect === "allow" &&
        (g.resource === "*" || g.resource === resource) &&
        (g.action === "*" || g.action === "view") &&
        (!g.expires || Date.parse(g.expires) > Date.now()),
    ) &&
    !effectiveGrants(u, bundles).some(
      (g) =>
        g.effect === "deny" &&
        (g.resource === "*" || g.resource === resource) &&
        (g.action === "*" || g.action === "view") &&
        (g.scope || "all") === "all" &&
        (!g.expires || Date.parse(g.expires) > Date.now()),
    )
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
    if (
      g.resource !== "*" &&
      !RESOURCES[g.resource] &&
      !["expenses.amount", "projects.budget", "users.phone"].includes(
        g.resource,
      )
    )
      throw validationError("نوع صلاحية غير صالح");
    if (g.action !== "*" && !ACTIONS[g.action])
      throw validationError("إجراء غير صالح");
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
  const gs = effectiveGrants(u, bundles),
    specific = gs.filter((g) => g.resource === resource + "." + field);
  return !specific.some(
    (g) =>
      g.effect === "deny" &&
      (g.action === "view" || g.action === "*") &&
      (!g.expires || Date.parse(g.expires) > Date.now()) &&
      ((g.scope || "all") === "all" ||
        (g.scope === "project" &&
          (record.project_id === g.projectId ||
            (resource === "projects" && record.id === g.projectId))) ||
        (g.scope === "committee" &&
          (record.committee_id || parse(record.meta).committee_id) ===
            g.committeeId) ||
        (g.scope === "assigned" &&
          (record.assignee_id === u.id || record.created_by === u.id))),
  );
}

export function withCommittees(user, committees) {
  const committeeGrants = committees.flatMap((c) => {
    const membership = parse(c.members, []).find((m) => m.id === user.id);
    return membership
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
              : ["view", "create", "edit"].map((action) => ({
                  resource: "expenses",
                  action,
                  effect: "allow",
                  assignedOnly: true,
                }))),
            ...(membership.grants || []),
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
    committeeGrants: [
      { resource: "assistant", action: "view", effect: "allow", scope: "all" },
      ...committeeGrants,
    ],
  };
}
export function taskStatuses(settings, committees, task) {
  return settings.taskStatuses;
}
