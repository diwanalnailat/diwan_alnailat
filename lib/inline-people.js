import { parse, string } from "./domain.js";
import { MEMBER_PRESETS } from "./governance.js";
import { integrationError, limit } from "./integrations.js";
import {
  managerInvitation,
  normalizeMemberPhone,
} from "./committee-invitations.js";

const fail = (message, status = 400) => {
  throw integrationError(message, status);
};
const stamp = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const guard = (db) =>
  db.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(uid());

// Each request gets a private overlay. Reads may validate pending people and
// memberships; the first business batch persists everything in one transaction.
export function inlineDatabase(source) {
  const db = {
    dialect: source?.dialect,
    prepare: (...args) => source.prepare(...args),
    batch: async (statements) => {
      const plan = db.inline;
      if (!plan || plan.committed || plan.cancelled)
        return source.batch(statements);
      const result = await source.batch([
        ...plan.before,
        ...statements,
        ...plan.after,
      ]);
      plan.committed = true;
      return result;
    },
  };
  return db;
}

export async function prepareInlinePeople(
  db,
  c,
  body,
  path,
  env,
  { record, grant },
) {
  if (body.inline_people === undefined) return;
  c.need("users", "manage");
  const definitions = body.inline_people;
  if (
    !Array.isArray(definitions) ||
    !definitions.length ||
    definitions.length > 20 ||
    body.manager_new
  )
    fail("راجع الأشخاص المضافين في النموذج");
  const before = [],
    after = [],
    records = new Map(),
    resolved = {},
    people = new Map(),
    refs = [];
  const plan = {
    before,
    after,
    records,
    resolved,
    originalBody: structuredClone(body),
    committed: false,
    recordId: null,
  };
  const ref = (object, key, role) => {
    const token = object?.[key];
    if (typeof token === "string" && token.startsWith("new-person:"))
      refs.push({ object, key, token, role });
  };
  let resource, target, committee, project, recordId;
  if (path === "/api/committees/save") {
    resource = "committees";
    target = body.id ? await record(db, resource, body.id) : null;
    recordId = target?.id || uid();
    project = await record(
      db,
      "projects",
      target?.project_id || body.project_id,
    );
    committee = target || {
      id: recordId,
      project_id: project.id,
      members: "[]",
      version: 0,
    };
    body.members = structuredClone(
      body.members === undefined ? parse(committee.members, []) : body.members,
    );
    if (!Array.isArray(body.members)) fail("راجع أعضاء اللجنة");
    ref(body, "manager_id", "manager");
    ref(body, "second_approver_id", "approver");
    ref(body, "review_delegate_id", "delegate");
    for (const m of body.members)
      ref(
        m,
        "id",
        ["manager", "supervisor"].includes(m.role) ? m.role : "member",
      );
  } else if (
    ["/api/tasks/save", "/api/tasks/request", "/api/tasks/comment"].includes(
      path,
    )
  ) {
    resource = "tasks";
    const targetId = path.endsWith("/request") ? body.parent_id : body.id;
    target = targetId ? await record(db, resource, targetId) : null;
    recordId = path.endsWith("/request") ? uid() : target?.id || uid();
    project = await record(
      db,
      "projects",
      target?.project_id || body.project_id,
    );
    committee = await record(
      db,
      "committees",
      parse(target?.meta).committee_id ||
        body.meta?.committee_id ||
        body.committee_id,
    );
    if (path.endsWith("/comment")) {
      if (!Array.isArray(body.mentions)) fail("راجع الأشخاص المشار إليهم");
      for (let i = 0; i < body.mentions.length; i++)
        ref(body.mentions, i, "participant");
      c.need("tasks", "assign", target);
    } else if (path.endsWith("/request")) ref(body, "recipient_id", "assignee");
    else {
      ref(body, "assignee_id", "assignee");
      if (body.meta?.collaborators)
        for (let i = 0; i < body.meta.collaborators.length; i++)
          ref(body.meta.collaborators, i, "participant");
    }
  } else if (path === "/api/advances/create") {
    resource = "advances";
    recordId = uid();
    project = await record(db, "projects", body.project_id);
    committee = await record(db, "committees", body.committee_id);
    ref(body, "assignee_id", "custodian");
  } else if (path === "/api/assets/move") {
    resource = "assets";
    target = await record(db, resource, body.id);
    recordId = target.id;
    project = body.project_id
      ? await record(db, "projects", body.project_id)
      : null;
    ref(body, "member_id", "custodian");
  } else if (path === "/api/guides/save") {
    resource = "documents";
    target = body.id ? await record(db, resource, body.id) : null;
    recordId = target?.id || uid();
    project = await record(db, "projects", body.project_id);
    ref(body.content, "assignee_id", "proposed");
  } else if (path === "/api/join-requests/forward") {
    resource = "join_requests";
    target = await record(db, resource, body.id);
    recordId = target.id;
    committee = await record(db, "committees", target.committee_id);
    project = await record(db, "projects", committee.project_id);
    ref(body, "supervisor_id", "supervisor");
  } else fail("إضافة الأشخاص غير متاحة في هذا الإجراء");
  if (project?.status === "closed") fail("المشروع مغلق");
  if (committee && project && committee.project_id !== project.id)
    fail("اللجنة من مشروع آخر");
  if (
    !refs.length ||
    new Set(definitions.map((d) => d.token)).size !== definitions.length
  )
    fail("راجع الأشخاص المضافين في النموذج");
  if (refs.some((r) => !definitions.some((d) => d.token === r.token)))
    fail("بيانات الشخص المضاف غير مكتملة");
  for (const d of definitions) {
    if (
      !/^new-person:[a-f0-9-]{36}$/.test(d.token || "") ||
      !refs.some((r) => r.token === d.token)
    )
      fail("مرجع الشخص غير صالح");
    const name = string(d.name, 120),
      phone = normalizeMemberPhone(d.phone),
      email = string(d.email, 180, true).trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("راجع البريد الإلكتروني");
    let m = people.get(phone);
    if (!m) {
      const old = await db
        .prepare("SELECT * FROM nl_members WHERE phone=?")
        .bind(phone)
        .first();
      if (old && old.status !== "active")
        fail("رقم الجوال مرتبط بحساب غير مفعّل؛ راجع إدارة المستخدمين");
      if (
        !old &&
        email &&
        (await db
          .prepare("SELECT id FROM nl_members WHERE lower(email)=?")
          .bind(email)
          .first())
      )
        fail("البريد الإلكتروني مرتبط بحساب آخر");
      m = old || {
        id: uid(),
        name,
        phone,
        email,
        status: "active",
        grants: "[]",
        bundles: "[]",
        verified: 0,
        version: 1,
      };
      const pref = await db
        .prepare(
          "SELECT whatsapp FROM nl_contact_preferences WHERE member_id=?",
        )
        .bind(m.id)
        .first();
      if (pref && !pref.whatsapp)
        fail("هذا العضو أوقف إشعارات واتساب؛ اختر حسابه المسجل دون إرسال دعوة");
      people.set(phone, m);
      records.set("users:" + m.id, m);
      if (!old)
        before.push(
          db
            .prepare(
              "INSERT INTO nl_members(id,name,email,phone,status,grants,bundles,created) VALUES(?,?,?,?,'active','[]','[]',?)",
            )
            .bind(m.id, m.name, m.email, m.phone, stamp()),
        );
      else
        before.push(
          db
            .prepare(
              "UPDATE nl_members SET version=version WHERE id=? AND version=? AND phone=? AND status='active'",
            )
            .bind(m.id, m.version, m.phone),
          guard(db),
        );
      after.push(
        db
          .prepare(
            "INSERT INTO nl_audit(id,actor,action,resource,entity_id,project_id,detail,created) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            uid(),
            c.u.id,
            old ? "ربط شخص مسجل" : "إضافة شخص من النموذج",
            "users",
            m.id,
            project?.id || null,
            resource,
            stamp(),
          ),
      );
    }
    resolved[d.token] = m.id;
  }
  for (const r of refs) r.object[r.key] = resolved[r.token];
  if (committee) {
    let members =
      resource === "committees"
        ? body.members
        : structuredClone(parse(committee.members, []));
    if (resource === "committees") {
      const stagedIds = new Set(Object.values(resolved)),
        combined = [];
      for (const member of members) {
        const previous =
          stagedIds.has(member.id) && combined.find((m) => m.id === member.id);
        if (!previous) combined.push(member);
        else {
          if (!Array.isArray(previous.grants) || !Array.isArray(member.grants))
            fail("راجع صلاحيات أعضاء اللجنة");
          previous.grants = [
            ...previous.grants,
            ...member.grants.filter(
              (g) =>
                !previous.grants.some(
                  (old) => JSON.stringify(old) === JSON.stringify(g),
                ),
            ),
          ];
          if (
            member.role === "manager" ||
            (member.role === "supervisor" && previous.role !== "manager")
          )
            previous.role = member.role;
        }
      }
      members = combined;
    }
    for (const r of refs) {
      const id = resolved[r.token],
        isReviewer = ["approver", "delegate"].includes(r.role);
      const role = ["manager", "supervisor"].includes(r.role)
        ? r.role
        : "member";
      const needed = isReviewer
        ? ["view", "approve"].map((action) => ({
            resource: "expenses",
            action,
            effect: "allow",
          }))
        : MEMBER_PRESETS[role];
      let member = members.find((m) => m.id === id);
      if (!member) {
        member = { id, role, grants: [] };
        members.push(member);
      }
      if (
        role === "manager" ||
        (role === "supervisor" && member.role !== "manager")
      )
        member.role = role;
      for (const g of [
        { resource: "committees", action: "view", effect: "allow" },
        ...needed,
      ])
        grant(c, {
          ...g,
          scope: "committee",
          committeeId: committee.id,
          projectId: committee.project_id,
        });
      for (const g of needed)
        if (
          !(member.grants || []).some(
            (old) => JSON.stringify(old) === JSON.stringify(g),
          )
        )
          member.grants = [...(member.grants || []), g];
    }
    if (members.length > 200) fail("وصلت اللجنة إلى الحد المتاح للأعضاء");
    if (resource === "committees") {
      body.members = members;
      const replacement = {
        ...committee,
        members: JSON.stringify(members),
        manager_id:
          body.manager_id === undefined
            ? committee.manager_id
            : body.manager_id,
      };
      c.committees = [
        ...c.committees.filter((k) => k.id !== committee.id),
        replacement,
      ];
    } else {
      c.need("committees", "edit", committee);
      const replacement = {
        ...committee,
        members: JSON.stringify(members),
        version: committee.version + 1,
      };
      before.push(
        db
          .prepare(
            "UPDATE nl_committees SET members=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(replacement.members, committee.id, committee.version),
        guard(db),
      );
      records.set("committees:" + committee.id, replacement);
      c.committees = c.committees.map((k) =>
        k.id === committee.id ? replacement : k,
      );
    }
  }
  if (path === "/api/tasks/comment") {
    const meta = parse(target.meta);
    meta.collaborators = [
      ...new Set([...(meta.collaborators || []), ...Object.values(resolved)]),
    ];
    const replacement = {
      ...target,
      meta: JSON.stringify(meta),
      version: target.version + 1,
    };
    before.push(
      db
        .prepare(
          "UPDATE nl_tasks SET meta=?,version=version+1 WHERE id=? AND version=?",
        )
        .bind(replacement.meta, target.id, target.version),
      guard(db),
    );
    records.set("tasks:" + target.id, replacement);
  }
  const names = {
    manager: "مدير اللجنة",
    approver: "المعتمد الثاني للمصاريف",
    delegate: "بديل الاعتماد عند تعارض المصالح",
    member: "عضو اللجنة",
    supervisor: "مشرف اللجنة",
    assignee: "مسؤول التنفيذ",
    participant: "مشارك في المهمة",
    custodian: "مستلم العهدة",
    proposed: "المسؤول المقترح في مسودة",
  };
  await limit(db, "inline-people:" + c.u.id, 20, 3600);
  for (const m of people.values()) {
    const roles = [
      ...new Set(
        refs.filter((r) => resolved[r.token] === m.id).map((r) => r.role),
      ),
    ];
    const role =
      roles.find((r) =>
        ["manager", "approver", "delegate", "supervisor", "assignee"].includes(
          r,
        ),
      ) || roles[0];
    const title = `تمت إضافتك بصفة ${roles.map((r) => names[r]).join("، ")}${resource === "committees" ? " في لجنة " + string(body.name, 120) : ""}${project ? " في مشروع " + project.title : ""}`;
    const invitation = await managerInvitation(env, m, committee, project, {
      resource,
      entityId: recordId,
      role,
      title,
      body:
        role === "proposed"
          ? "هذا ترشيح في مسودة، وليس تكليفًا بمهمة. يمكنك زيارة المنصة للاطلاع على ما يُسند إليك لاحقًا."
          : "يرجى زيارة المنصة للاطلاع على دورك ومهامك الموكلة إليك.",
    });
    after.push(...invitation.statements);
  }
  plan.recordId = recordId;
  db.inline = plan;
}
