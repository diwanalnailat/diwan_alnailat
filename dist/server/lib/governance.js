import { parse } from "./domain.js";
export const TASK_FLOW = [
  { id: "todo", name: "بانتظار البدء", color: "#92958d", done: false },
  { id: "doing", name: "قيد التنفيذ", color: "#bba47e", done: false },
  { id: "blocked", name: "تحتاج مساندة", color: "#b77656", done: false },
  { id: "review", name: "لدى مدير اللجنة", color: "#8d7b9b", done: false },
  { id: "done", name: "معتمدة ومكتملة", color: "#648c76", done: true },
];
export const TASK_TYPES = [
  { id: "execution", name: "مهمة تنفيذية" },
  { id: "delivery", name: "تجهيز واستلام" },
  { id: "coordination", name: "تنسيق ومتابعة" },
  { id: "content", name: "إعداد محتوى أو مستند" },
  { id: "hospitality", name: "ضيافة وتموين" },
  { id: "reception", name: "استقبال وتنظيم الزيارات" },
  { id: "media", name: "تغطية إعلامية ونشر" },
  { id: "photography", name: "تصوير ومونتاج" },
  { id: "transport", name: "نقل وحركة المركبات" },
  { id: "site", name: "تجهيز الخيام والمرافق" },
  { id: "maintenance", name: "صيانة ومعالجة عطل" },
  { id: "herd", name: "رعاية المنقية وتجهيز المشاركة" },
  { id: "inventory", name: "جرد وتسليم واسترداد الأصول" },
  { id: "safety", name: "سلامة ونظافة وجاهزية" },
  { id: "finance", name: "مراجعة مصروف وتصفية عهدة" },
  { id: "suppliers", name: "تنسيق مورد وتقييم خدمة" },
  { id: "meeting", name: "اجتماع وتنفيذ قرار" },
  { id: "archive", name: "توثيق وأرشفة الموسم" },
  { id: "closeout", name: "إقفال وتقييم المشاركة" },
];
export const FILE_PURPOSES = {
  guide: "دليل تنفيذ",
  reference: "مستند مرجعي",
  proof: "إثبات إنجاز",
  voice: "توجيه صوتي",
  invoice: "فاتورة",
  receipt: "إيصال دفع",
  reimbursement: "إيصال سداد للعضو",
  handover: "إثبات تسليم",
  supplier: "مستند مورد",
  asset: "مستند أصل",
  comment: "مرفق محادثة",
};
export const MEMBER_PRESETS = {
  member: [
    ...["view", "edit"].map((action) => ({
      resource: "tasks",
      action,
      effect: "allow",
      assignedOnly: true,
    })),
    ...["view", "create", "edit"].map((action) => ({
      resource: "expenses",
      action,
      effect: "allow",
      assignedOnly: true,
    })),
  ],
  manager: [
    ...["view", "create", "edit", "assign", "approve", "export"].map(
      (action) => ({ resource: "tasks", action, effect: "allow" }),
    ),
    ...["view", "create", "edit", "approve", "export"].map((action) => ({
      resource: "expenses",
      action,
      effect: "allow",
    })),
    { resource: "committees", action: "edit", effect: "allow" },
  ],
  supervisor: [
    { resource: "tasks", action: "view", effect: "allow" },
    { resource: "expenses", action: "view", effect: "allow" },
  ],
};
export function committeeConfig(c) {
  return {
    taskTypes: TASK_TYPES,
    tags: ["ميداني", "قبل الافتتاح", "أثناء المشاركة", "بعد المشاركة"],
    budgetLines: [],
    ...parse(c?.config),
  };
}
export function secondApprover(committee) {
  return committeeConfig(committee).second_approver_id || null;
}
export function expenseRoute(committee, claimant, creator) {
  const cfg = committeeConfig(committee);
  return [committee?.manager_id || null, secondApprover(committee)].map((id) =>
    id && [claimant, creator].includes(id)
      ? cfg.review_delegate_id || null
      : id,
  );
}
// Authority comes from persisted grants and committee membership only.
export function withProjectAccess(u) {
  return u;
}

// One-time data conversion of the previously configured project approver.
// This preserves the prior access scope as explicit, editable member grants.
export async function migrateLegacyApprovals(db, projects, committees, actor) {
  const old = projects.filter((p) => parse(p.meta).supervisor_id);
  if (!old.length) return false;
  const statements = [],
    updates = new Map();
  for (const p of old) {
    const meta = parse(p.meta),
      id = meta.supervisor_id;
    let m = updates.get(id);
    if (!m) {
      const r = await db
        .prepare("SELECT * FROM nl_members WHERE id=?")
        .bind(id)
        .first();
      if (r) m = { ...r, grants: parse(r.grants, []) };
    }
    if (m) {
      const grants = [
        ...[
          "projects",
          "committees",
          "tasks",
          "expenses",
          "advances",
          "documents",
        ].map((resource) => ({ resource, action: "view" })),
        ...["approve", "export", "pay"].map((action) => ({
          resource: "expenses",
          action,
        })),
        { resource: "advances", action: "export" },
      ].map((g) => ({
        ...g,
        effect: "allow",
        scope: "project",
        projectId: p.id,
      }));
      for (const g of grants)
        if (!m.grants.some((x) => JSON.stringify(x) === JSON.stringify(g)))
          m.grants.push(g);
      updates.set(id, m);
      for (const k of committees.filter((k) => k.project_id === p.id))
        if (!secondApprover(k)) {
          statements.push(
            db
              .prepare(
                "UPDATE nl_committees SET config=?,version=version+1 WHERE id=? AND version=?",
              )
              .bind(
                JSON.stringify({
                  ...committeeConfig(k),
                  second_approver_id: id,
                }),
                k.id,
                k.version,
              ),
            db
              .prepare("INSERT INTO nl_guards VALUES(?,changes())")
              .bind(crypto.randomUUID()),
          );
        }
    }
    delete meta.supervisor_id;
    statements.push(
      db
        .prepare(
          "UPDATE nl_projects SET meta=?,version=version+1 WHERE id=? AND version=?",
        )
        .bind(JSON.stringify(meta), p.id, p.version),
      db
        .prepare("INSERT INTO nl_guards VALUES(?,changes())")
        .bind(crypto.randomUUID()),
    );
  }
  for (const m of updates.values())
    statements.push(
      db
        .prepare(
          "UPDATE nl_members SET grants=?,version=version+1 WHERE id=? AND version=?",
        )
        .bind(JSON.stringify(m.grants), m.id, m.version),
      db
        .prepare("INSERT INTO nl_guards VALUES(?,changes())")
        .bind(crypto.randomUUID()),
    );
  statements.push(
    db
      .prepare("INSERT INTO nl_audit VALUES(?,?,?,?,?,?,?,?)")
      .bind(
        crypto.randomUUID(),
        actor.id,
        "نقل الاعتماد من المشروع إلى اللجنة والصلاحيات",
        "settings",
        "approval-model",
        null,
        "نقل الإعدادات السابقة دون توسيع نطاق الوصول",
        new Date().toISOString(),
      ),
  );
  await db.batch(statements);
  return true;
}
