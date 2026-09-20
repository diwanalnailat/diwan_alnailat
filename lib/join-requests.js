import { parse, permitted, withCommittees, string } from "./domain.js";
import { MEMBER_PRESETS } from "./governance.js";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const rows = async (db, sql, ...args) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
const stamp = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
export const DEFAULT_JOIN_POLICY = {
  title: "شروط وسياسة الانضمام إلى ديوان النائلات",
  content:
    "شروط الانضمام\nقدّم اسمك الصحيح ورقم جوال تملكه وسبب رغبتك في الانضمام، واختر اللجنة المناسبة إن وجدت. توثيق الجوال لا يعني قبول الطلب؛ تبدأ العضوية بعد موافقة الإدارة أو المشرف الذي توجّه إليه الإدارة الطلب.\n\nالتزامات العضو\nاحترم أعضاء الفريق، والتزم بتوجيهات الديوان ومهام لجنتك، وحافظ على سرية المعلومات والمستندات التي تطّلع عليها. لا تستخدم اسم الديوان أو تنشر بياناته دون إذن الإدارة. تُراجع العضوية والصلاحيات وفق احتياج العمل والالتزام بهذه الشروط.\n\nسياسة بيانات الطلب\nيُستخدم الاسم والجوال وسبب الانضمام واللجنة المطلوبة لدراسة الطلب وإنشاء الحساب عند القبول والتواصل بشأن العضوية. تطّلع الإدارة على الطلب، ولا يطّلع عليه مشرف اللجنة إلا إذا وجّهته الإدارة إليه. تُحفظ نسخة الشروط التي وافقت عليها وتاريخ الموافقة وتوثيق الجوال مع الطلب. يمكنك التواصل مع إدارة الديوان لطلب تصحيح بياناتك أو سحب طلبك.\n\nرسائل واتساب\nبالموافقة تسمح بإرسال رمز التحقق إلى رقمك لإثبات ملكيته. لا تشارك الرمز مع أحد. إشعارات المهام الأخرى تخضع لتفضيلات التواصل في حسابك.",
  version: 0,
};
export async function joinPolicy(db) {
  const row = await db
    .prepare("SELECT value,version FROM nl_settings WHERE key='join_policy'")
    .first();
  return row
    ? { ...parse(row.value), version: row.version }
    : DEFAULT_JOIN_POLICY;
}
export const isJoinAdmin = (c) => c.can("users", "manage");
export function isCommitteeSupervisor(committee, memberId) {
  return (
    !!committee &&
    (committee.manager_id === memberId ||
      parse(committee.members, []).some(
        (m) => m.id === memberId && ["manager", "supervisor"].includes(m.role),
      ))
  );
}
export function mayReadJoin(c, row, action = "view") {
  const admin = isJoinAdmin(c);
  if (
    !admin &&
    (row.assigned_to !== c.u.id ||
      !isCommitteeSupervisor(
        c.committees.find((k) => k.id === row.committee_id),
        c.u.id,
      ))
  )
    return false;
  if (
    !admin &&
    !c.can(
      "committees",
      "view",
      c.committees.find((k) => k.id === row.committee_id),
    )
  )
    return false;
  return permitted(
    {
      ...c.u,
      committeeGrants: [
        ...(c.u.committeeGrants || []),
        {
          resource: "join_requests",
          action,
          effect: "allow",
          scope: admin ? "all" : "assigned",
        },
      ],
    },
    "join_requests",
    action,
    { ...row, assignee_id: row.assigned_to },
    c.bundles,
  );
}
export function joinAccess(c) {
  return (
    isJoinAdmin(c) ||
    c.committees.some(
      (k) => isCommitteeSupervisor(k, c.u.id) && c.can("committees", "view", k),
    )
  );
}
export async function visibleJoinRequests(db, c) {
  const list = isJoinAdmin(c)
    ? await rows(
        db,
        "SELECT * FROM nl_join_requests WHERE status<>'verifying' ORDER BY created DESC",
      )
    : await rows(
        db,
        "SELECT * FROM nl_join_requests WHERE assigned_to=? AND status<>'verifying' ORDER BY created DESC",
        c.u.id,
      );
  return list.filter((r) => mayReadJoin(c, r));
}
export function joinNotice(db, memberId, request, title, whatsapp = true) {
  return ["in_app", ...(whatsapp ? ["whatsapp"] : [])].map((channel) =>
    db
      .prepare(
        "INSERT INTO nl_notifications(id,member_id,title,body,resource,entity_id,project_id,channel,status,created) VALUES(?,?,?,'','join_requests',?,NULL,?,?,?)",
      )
      .bind(
        uid(),
        memberId,
        title,
        request.id,
        channel,
        channel === "in_app" ? "unread" : "not_connected",
        stamp(),
      ),
  );
}
export async function joinAdminNotices(db, request, committee) {
  const [members, bundles] = await Promise.all([
    rows(db, "SELECT * FROM nl_members WHERE status='active'"),
    rows(db, "SELECT * FROM nl_bundles"),
  ]);
  const title = `يوجد طلب انضمام ${committee ? "للجنة " + committee.name : "للديوان"} بانتظار ردكم.`;
  return members
    .filter((m) => permitted(m, "users", "manage", null, bundles))
    .flatMap((m) => joinNotice(db, m.id, request, title));
}
const guard = (db) =>
  db.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(uid());
const audit = (db, c, action, id) =>
  db
    .prepare(
      "INSERT INTO nl_audit(id,actor,action,resource,entity_id,detail,created) VALUES(?,?,?,'join_requests',?,'',?)",
    )
    .bind(uid(), c.u.id, action, id, stamp());
export async function joinDashboard(db, c) {
  const admin = isJoinAdmin(c);
  const list = await visibleJoinRequests(db, c);
  const people = await rows(
    db,
    "SELECT id,name,status FROM nl_members WHERE status='active'",
  );
  return {
    is_admin: admin,
    requests: list.map((r) => ({
      ...r,
      policy_snapshot: undefined,
      committee_name:
        c.committees.find((k) => k.id === r.committee_id)?.name || null,
      assigned_name: people.find((m) => m.id === r.assigned_to)?.name || null,
      can_decide:
        ["pending", "referred"].includes(r.status) &&
        mayReadJoin(c, r, "approve"),
      can_forward:
        admin &&
        !!r.committee_id &&
        ["pending", "referred"].includes(r.status) &&
        mayReadJoin(c, r, "manage"),
    })),
    supervisors: admin
      ? c.committees.flatMap((k) =>
          people
            .filter((m) => isCommitteeSupervisor(k, m.id))
            .map((m) => ({ id: m.id, name: m.name, committee_id: k.id })),
        )
      : [],
    policy: await joinPolicy(db),
    can_edit_policy: admin,
  };
}
export async function saveJoinPolicy(db, c, b) {
  if (!isJoinAdmin(c)) fail("تعديل السياسة متاح للإدارة فقط", 403);
  const title = string(b.title, 160),
    content = string(b.content, 20000);
  const old = await joinPolicy(db);
  if (b.version !== old.version) fail("تغيرت السياسة. حدّث الصفحة أولًا", 409);
  await db.batch([
    db
      .prepare(
        "INSERT INTO nl_settings(key,value,version) VALUES('join_policy',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=nl_settings.version+1 WHERE nl_settings.version=?",
      )
      .bind(JSON.stringify({ title, content }), old.version),
    guard(db),
    audit(db, c, "تحديث شروط الانضمام", "join_policy"),
  ]);
  return { ok: true };
}
export async function reviewJoin(db, c, b, action) {
  const r = await db
    .prepare("SELECT * FROM nl_join_requests WHERE id=?")
    .bind(string(b.id, 100))
    .first();
  if (!r || r.status === "verifying" || !mayReadJoin(c, r))
    fail("الطلب غير متاح", 404);
  if (!["pending", "referred"].includes(r.status) || r.version !== b.version)
    fail("تم تحديث الطلب أو اتخاذ القرار. حدّث الصفحة", 409);
  const k = c.committees.find((k) => k.id === r.committee_id);
  const statements = [];
  // Guard the committee snapshot so removal or reassignment of a supervisor wins.
  if (k)
    statements.push(
      db
        .prepare(
          "UPDATE nl_committees SET version=version WHERE id=? AND version=?",
        )
        .bind(k.id, k.version),
      guard(db),
    );
  if (action === "forward") {
    if (!isJoinAdmin(c) || !mayReadJoin(c, r, "manage"))
      fail("توجيه الطلب متاح للإدارة فقط", 403);
    const target = await db
      .prepare("SELECT * FROM nl_members WHERE id=? AND status='active'")
      .bind(string(b.supervisor_id, 100))
      .first();
    if (
      !k ||
      !target ||
      !isCommitteeSupervisor(k, target.id) ||
      !permitted(
        withCommittees(target, c.committees),
        "committees",
        "view",
        k,
        c.bundles,
      )
    )
      fail("اختر مشرفًا نشطًا من اللجنة نفسها");
    statements.push(
      db
        .prepare(
          "UPDATE nl_join_requests SET assigned_to=?,status='referred',version=version+1,updated=? WHERE id=? AND version=? AND status IN ('pending','referred')",
        )
        .bind(target.id, stamp(), r.id, r.version),
      guard(db),
      ...joinNotice(
        db,
        target.id,
        r,
        `يوجد طلب انضمام للجنة ${k.name} بانتظار ردكم.`,
        false,
      ),
      audit(db, c, "توجيه طلب انضمام", r.id),
    );
    await db.batch(statements);
    return { ok: true };
  }
  if (!["approve", "reject"].includes(b.decision))
    fail("اختر قبول الطلب أو رفضه");
  if (!mayReadJoin(c, r, "approve")) fail("ليس لديك صلاحية لاتخاذ القرار", 403);
  let memberId = null;
  if (b.decision === "approve") {
    if (
      k &&
      !c.projectRows.some((p) => p.id === k.project_id && p.status === "active")
    )
      fail("اللجنة غير متاحة للانضمام حاليًا");
    const old = await db
      .prepare("SELECT * FROM nl_members WHERE phone=?")
      .bind(r.phone)
      .first();
    if (old?.status === "suspended")
      fail("الحساب موقوف. راجع إدارة الأعضاء أولًا", 409);
    if (old && old.status !== "active" && !isJoinAdmin(c))
      fail("هذا الرقم مرتبط بحساب يحتاج مراجعة الإدارة", 409);
    memberId = old?.id || uid();
    if (!old)
      statements.push(
        db
          .prepare(
            "INSERT INTO nl_members(id,name,phone,status,grants,bundles,verified,created) VALUES(?,?,?,'active','[]','[]',1,?)",
          )
          .bind(memberId, r.name, r.phone, stamp()),
      );
    else if (old.status !== "active")
      statements.push(
        db
          .prepare(
            "UPDATE nl_members SET name=?,status='active',verified=1,version=version+1 WHERE id=? AND version=? AND phone=?",
          )
          .bind(r.name, old.id, old.version, r.phone),
        guard(db),
      );
    else
      statements.push(
        db
          .prepare(
            "UPDATE nl_members SET version=version WHERE id=? AND version=? AND status='active' AND phone=?",
          )
          .bind(old.id, old.version, r.phone),
        guard(db),
      );
    if (k) {
      const members = parse(k.members, []);
      if (!members.some((m) => m.id === memberId)) {
        members.push({
          id: memberId,
          role: "member",
          grants: MEMBER_PRESETS.member,
        });
        statements.push(
          db
            .prepare(
              "UPDATE nl_committees SET members=?,version=version+1 WHERE id=? AND version=?",
            )
            .bind(JSON.stringify(members), k.id, k.version),
          guard(db),
        );
      }
    }
  }
  statements.push(
    db
      .prepare(
        "UPDATE nl_join_requests SET status=?,member_id=?,decided_by=?,version=version+1,updated=? WHERE id=? AND version=? AND status IN ('pending','referred')",
      )
      .bind(
        b.decision === "approve" ? "approved" : "rejected",
        memberId,
        c.u.id,
        stamp(),
        r.id,
        r.version,
      ),
    guard(db),
    audit(
      db,
      c,
      b.decision === "approve" ? "قبول طلب انضمام" : "رفض طلب انضمام",
      r.id,
    ),
  );
  await db.batch(statements);
  return { ok: true, member_id: memberId };
}
