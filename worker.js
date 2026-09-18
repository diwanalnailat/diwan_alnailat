import { validateLocation } from "./lib/location.js";
import { ASSET_CATEGORIES, ASSET_BATCH_LIMIT } from "./lib/assets.js";
import { jsonBody, formBody, httpsOrigin } from "./lib/security.js";
import {
  mediaForReader,
  canReadEngagement,
  canReadSupplierFile,
} from "./lib/media-access.js";
import { validateSanadConfig, sanadConfig } from "./lib/sanad-policy.js";
import { readiness, maintain } from "./lib/operations.js";
import {
  integrationStatus,
  requestOtp,
  verifyOtp,
  webhook,
  whatsapp,
  providerFetch,
  limit,
} from "./lib/integrations.js";
import {
  ask as askSanad,
  history as sanadHistory,
  extractInvoice,
  accessTag,
} from "./lib/sanad.js";
import {
  TASK_FLOW,
  TASK_TYPES,
  FILE_PURPOSES,
  MEMBER_PRESETS,
  committeeConfig,
  secondApprover,
  expenseRoute,
  migrateLegacyApprovals,
  withProjectAccess,
} from "./lib/governance.js";
import { legacyInfo, legacyCopy } from "./lib/legacy.js";
import { ASSETS } from "./generated.js";
import {
  withCommittees,
  taskStatuses,
  DEFAULT_SETTINGS,
  RESOURCES,
  RESOURCE_ACTIONS,
  permitted,
  maySeeModule,
  effectiveGrants,
  parse,
  money,
  validDate,
  string,
  choice,
  validateGrants,
  fieldVisible,
} from "./lib/domain.js";
export { money, permitted } from "./lib/domain.js";
const ACTION_NAMES = {
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
const uid = () => crypto.randomUUID(),
  now = () => new Date().toISOString();
const policy = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...policy, "Content-Type": "application/json; charset=utf-8" },
  });
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const all = async (db, sql, ...args) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
const one = async (db, sql, ...args) =>
  db
    .prepare(sql)
    .bind(...args)
    .first();
const digest = async (s) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const tables = {
  committees: "nl_committees",
  projects: "nl_projects",
  tasks: "nl_tasks",
  expenses: "nl_expenses",
  advances: "nl_advances",
  suppliers: "nl_suppliers",
  assets: "nl_assets",
  users: "nl_members",
  documents: "nl_guides",
};
const record = async (db, type, id) => {
  const table = tables[type];
  if (!table) fail("نوع سجل غير صالح");
  const r = await one(db, `SELECT * FROM ${table} WHERE id=?`, string(id));
  if (!r) fail("السجل غير متاح", 404);
  return r;
};
const normalize = (r) => ({
  ...r,
  ...("meta" in r ? { meta: parse(r.meta) } : {}),
  ...("grants" in r
    ? { grants: parse(r.grants, []), bundles: parse(r.bundles, []) }
    : {}),
});
async function actor(req, env) {
  const siteId = req.headers.get("oai-authenticated-user-id"),
    email = req.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (!siteId || !email) fail("سجّل الدخول للوصول إلى الديوان", 401);
  let u = await one(env.DB, "SELECT * FROM nl_members WHERE site_id=?", siteId);
  if (
    !u &&
    env.SITE_OWNER_EMAIL &&
    email === env.SITE_OWNER_EMAIL.toLowerCase()
  ) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO nl_members(id,site_id,name,email,status,grants,bundles,verified,created) VALUES(?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        "owner",
        siteId,
        "عبدالعزيز",
        email,
        "active",
        JSON.stringify([
          { resource: "*", action: "*", effect: "allow", scope: "all" },
        ]),
        "[]",
        1,
        now(),
      )
      .run();
    u = await one(env.DB, "SELECT * FROM nl_members WHERE site_id=?", siteId);
  }
  if (!u)
    fail(
      "الوصول متاح للحسابات المعتمدة. دخول الأعضاء بالجوال بانتظار الربط.",
      403,
    );
  if (u.status !== "active")
    fail(
      u.status === "pending"
        ? "حسابك بانتظار موافقة الأدمن"
        : "حسابك غير مفعّل",
      403,
    );
  return u;
}
const audit = (db, u, action, resource, id, projectId = "", detail = "") =>
  db
    .prepare("INSERT INTO nl_audit VALUES(?,?,?,?,?,?,?,?)")
    .bind(
      uid(),
      u.id,
      action,
      resource,
      id,
      projectId || null,
      detail.slice(0, 2500),
      now(),
    );
function notifications(
  db,
  settings,
  memberId,
  title,
  body,
  resource,
  entityId,
  projectId,
) {
  if (!memberId) return [];
  const r = [
    db
      .prepare("INSERT INTO nl_notifications VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(
        uid(),
        memberId,
        title,
        body,
        resource,
        entityId,
        projectId || null,
        "in_app",
        "unread",
        now(),
      ),
  ];
  if (settings.notifications.taskAssigned || resource !== "tasks")
    r.push(
      db
        .prepare("INSERT INTO nl_notifications VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(
          uid(),
          memberId,
          title,
          body,
          resource,
          entityId,
          projectId || null,
          "whatsapp",
          "not_connected",
          now(),
        ),
    );
  return r;
}
async function context(req, env, migrated = false) {
  const committees = await all(env.DB, "SELECT * FROM nl_committees");
  const projectRows = await all(env.DB, "SELECT * FROM nl_projects");
  const u = withProjectAccess(
    withCommittees(await actor(req, env), committees),
    projectRows,
  );
  const bundles = await all(env.DB, "SELECT * FROM nl_bundles");
  if (
    !migrated &&
    permitted(u, "users", "manage", null, bundles) &&
    (await migrateLegacyApprovals(env.DB, projectRows, committees, u))
  )
    return context(req, env, true);

  const row = await one(
    env.DB,
    "SELECT * FROM nl_settings WHERE key='workspace'",
  );
  const settings = { ...DEFAULT_SETTINGS, ...parse(row?.value) };
  settings.sanad = sanadConfig(settings);
  settings.taskStatuses = TASK_FLOW;
  settings.taskTypes = TASK_TYPES;
  settings.filePurposes = FILE_PURPOSES;
  settings.assetCategories = ASSET_CATEGORIES;
  settings.name = settings.name.replaceAll("النايلات", "النائلات");
  return {
    u,
    committees,
    projectRows,
    bundles,
    settings,
    settingsVersion: row?.version || 0,
    can: (r, a, o) => permitted(u, r, a, o, bundles),
    need: (r, a, o) => {
      if (!permitted(u, r, a, o, bundles))
        fail("ليس لديك صلاحية لهذا الإجراء", 403);
    },
  };
}
async function commit(db, c, request, body, stmts, result, guarded = false) {
  const key = request.headers.get("idempotency-key") || uid();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key)) fail("معرف الطلب غير صالح");
  const hash = await digest(request.url + "|" + JSON.stringify(body));
  const prior = await one(db, "SELECT * FROM nl_receipts WHERE id=?", key);
  if (prior) {
    if (prior.actor !== c.u.id || prior.hash !== hash)
      fail("معرف الطلب مستخدم لعملية مختلفة", 409);
    return json(parse(prior.result));
  }
  const list = [
    db
      .prepare("INSERT INTO nl_receipts VALUES(?,?,?,?,?)")
      .bind(key, c.u.id, hash, JSON.stringify(result), now()),
    ...stmts,
  ];
  if (guarded)
    list.splice(
      2,
      0,
      db.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(uid()),
    );
  try {
    await db.batch(list);
  } catch (e) {
    const prev = await one(db, "SELECT * FROM nl_receipts WHERE id=?", key);
    if (prev && prev.actor === c.u.id && prev.hash === hash)
      return json(parse(prev.result));
    if (String(e.message).includes("nl_guard_changed"))
      fail(
        "تغيرت البيانات أو لم يعد الرصيد كافيًا. حدّث الصفحة وأعد المحاولة.",
        409,
      );
    throw e;
  }
  return json(result);
}
function validateCustom(meta, settings) {
  for (const field of settings.customFields || []) {
    const v = meta.custom?.[field.id];
    if (field.required && (v === undefined || v === null || v === ""))
      fail("أكمل الحقل: " + field.name);
    if (
      v !== undefined &&
      v !== "" &&
      field.type === "number" &&
      !Number.isFinite(Number(v))
    )
      fail("قيمة غير صالحة في " + field.name);
    if (v && field.type === "date") validDate(v);
    if (v && field.type === "select" && !field.options.includes(v))
      fail("اختر قيمة متاحة في " + field.name);
  }
  return meta;
}
async function activeMember(db, id, optional = false) {
  if (!id && optional) return null;
  const m = await one(
    db,
    "SELECT * FROM nl_members WHERE id=? AND status='active'",
    id,
  );
  if (!m) fail("اختر عضوًا نشطًا");
  return m;
}
async function fileBindings(db, c, ids, resource, entityId) {
  if (!Array.isArray(ids) || ids.length > 10) fail("عدد المرفقات غير صالح");
  const stmts = [];
  for (const id of ids) {
    const f = await one(db, "SELECT * FROM nl_files WHERE id=?", id);
    if (
      !f ||
      f.created_by !== c.u.id ||
      f.entity_type !== "draft" ||
      (parse(f.meta).pending_resource &&
        parse(f.meta).pending_resource !== resource)
    )
      fail("مرفق غير متاح", 403);
    stmts.push(
      db
        .prepare(
          "UPDATE nl_files SET entity_type=?,entity_id=? WHERE id=? AND created_by=? AND entity_type=?",
        )
        .bind(resource, entityId, id, c.u.id, "draft"),
    );
    stmts.push(
      db.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(uid()),
    );
  }
  return stmts;
}
async function assertFileRead(db, c, f) {
  if (f.entity_type === "draft") {
    if (f.created_by !== c.u.id) fail("المرفق غير متاح", 403);
    return;
  }
  const r = await record(db, f.entity_type, f.entity_id);
  c.need(f.entity_type, "view", r);
  if (f.entity_type === "suppliers" && !canReadSupplierFile(c, r, f.id))
    fail("المرفق غير متاح ضمن وصولك", 403);
  if (
    f.entity_type === "expenses" &&
    !fieldVisible(c.u, "expenses", "amount", r, c.bundles)
  )
    fail("المرفق يتضمن بيانات مالية غير متاحة لك", 403);
}
async function state(db, c, filter = "", env = {}) {
  const projectRows = await all(
    db,
    "SELECT * FROM nl_projects ORDER BY created DESC",
  );
  const taskRows = await all(
    db,
    "SELECT * FROM nl_tasks ORDER BY due IS NULL,due,created DESC",
  );
  const expenseRows = await all(
    db,
    "SELECT * FROM nl_expenses ORDER BY date DESC,created DESC",
  );
  const memberRows = await all(db, "SELECT * FROM nl_members ORDER BY created");
  const payRows = await all(db, "SELECT * FROM nl_payments ORDER BY date DESC");
  const assetRows = await all(
    db,
    "SELECT * FROM nl_assets ORDER BY created DESC",
  );
  const supplierRows = await all(
    db,
    "SELECT * FROM nl_suppliers ORDER BY name",
  );
  const movements = await all(
    db,
    "SELECT * FROM nl_movements ORDER BY created DESC",
  );
  const advanceRows = await all(
    db,
    "SELECT * FROM nl_advances ORDER BY created DESC",
  );
  const entries = await all(
    db,
    "SELECT * FROM nl_advance_entries ORDER BY created",
  );
  const filterProject = (r) => !filter || r.project_id === filter;
  const advances = advanceRows
    .filter((a) => c.can("advances", "view", a) && filterProject(a))
    .map((a) => {
      const es = entries.filter((e) => e.advance_id === a.id);
      return {
        ...normalize(a),
        funded: es
          .filter((e) => e.type === "fund")
          .reduce((s, e) => s + e.amount, 0),
        settled: es
          .filter((e) => e.type === "settlement")
          .reduce((s, e) => s + e.amount, 0),
        returned: es
          .filter((e) => e.type === "return")
          .reduce((s, e) => s + e.amount, 0),
        balance: es.reduce(
          (s, e) => s + (e.type === "fund" ? e.amount : -e.amount),
          0,
        ),
      };
    });
  const tasks = taskRows.filter(
    (r) => c.can("tasks", "view", r) && filterProject(r),
  );
  const expenses = expenseRows.filter(
    (r) => c.can("expenses", "view", r) && filterProject(r),
  );
  const visibleCommittees = c.committees.filter((r) =>
    c.can("committees", "view", r),
  );
  const projects = projectRows
    .filter(
      (r) =>
        c.can("projects", "view", r) ||
        visibleCommittees.some((x) => x.project_id === r.id),
    )
    .map((r) => {
      const p = c.can("projects", "view", r)
        ? normalize(r)
        : {
            id: r.id,
            title: r.title,
            season: r.season,
            status: r.status,
            start: r.start,
            due: r.due,
            meta: {},
            version: r.version,
          };
      if (!fieldVisible(c.u, "projects", "budget", r, c.bundles))
        delete p.budget;
      return p;
    });
  const files = await all(
    db,
    "SELECT id,entity_type,entity_id,name,mime,size,created_by,created,meta FROM nl_files WHERE entity_type<>?",
    "draft",
  );
  const visibleFiles = files.filter((f) =>
    f.entity_type === "tasks"
      ? tasks.some((t) => t.id === f.entity_id)
      : f.entity_type === "expenses"
        ? expenses.some(
            (e) =>
              e.id === f.entity_id &&
              fieldVisible(c.u, "expenses", "amount", e, c.bundles),
          )
        : f.entity_type === "assets"
          ? assetRows.some(
              (a) => a.id === f.entity_id && c.can("assets", "view", a),
            )
          : f.entity_type === "advances"
            ? advanceRows.some(
                (a) => a.id === f.entity_id && c.can("advances", "view", a),
              )
            : f.entity_type === "suppliers"
              ? supplierRows.some(
                  (s) =>
                    s.id === f.entity_id && canReadSupplierFile(c, s, f.id),
                )
              : false,
  );
  const canAssign =
    visibleCommittees.some((r) =>
      c.can("tasks", "assign", {
        committee_id: r.id,
        project_id: r.project_id,
      }),
    ) ||
    projectRows.some((r) => c.can("tasks", "assign", { project_id: r.id }));
  const neededIds = new Set([
    ...visibleCommittees.flatMap((c) => [
      secondApprover(c),
      committeeConfig(c).review_delegate_id,
    ]),
    ...expenses.flatMap((e) => {
      const k = c.committees.find((k) => k.id === parse(e.meta).committee_id);
      return [
        parse(e.meta).claimant_id,
        k?.manager_id,
        secondApprover(k),
        committeeConfig(k).review_delegate_id,
      ];
    }),
    ...advances.map((a) => a.assignee_id),
    ...visibleCommittees.flatMap((c) => parse(c.members, []).map((m) => m.id)),
    ...tasks.flatMap((t) => [
      t.assignee_id,
      t.created_by,
      parse(t.meta).reviewer_id,
      ...(parse(t.meta).collaborators || []),
    ]),
    ...movements
      .filter((m) =>
        assetRows.some(
          (a) => a.id === m.asset_id && c.can("assets", "view", a),
        ),
      )
      .map((m) => m.member_id),
  ]);
  const canChoosePeople =
    canAssign ||
    c.can("advances", "create") ||
    c.can("assets", "assign") ||
    c.can("expenses", "create") ||
    c.can("settings", "manage");
  const people = memberRows
    .filter(
      (m) =>
        m.status === "active" &&
        (canChoosePeople ||
          c.can("users", "view", m) ||
          neededIds.has(m.id) ||
          m.id === c.u.id),
    )
    .map((m) => ({ id: m.id, name: m.name, team: m.team }));
  const visibleAssets = assetRows
    .filter((a) => c.can("assets", "view", a))
    .map((a) => {
      const ms = movements.filter((m) => m.asset_id === a.id);
      const issued = ms.reduce(
        (s, m) =>
          s +
          (m.type === "issue"
            ? m.quantity
            : m.type === "return"
              ? -m.quantity
              : 0),
        0,
      );
      const consumed = ms.reduce(
        (s, m) => s + (m.type === "consume" ? m.quantity : 0),
        0,
      );
      return {
        ...normalize(a),
        issued,
        consumed,
        available: a.quantity - issued - consumed,
      };
    });
  const permittedExpenses = expenses.map((e) => {
    const ec = c.committees.find((k) => k.id === parse(e.meta).committee_id),
      ep = projectRows.find((p) => p.id === e.project_id);
    const r = {
      project_title: ep?.title || "",
      approval_context: ec
        ? {
            id: ec.id,
            name: ec.name,
            manager_id: ec.manager_id,
            config: {
              second_approver_id: secondApprover(ec),
              review_delegate_id:
                committeeConfig(ec).review_delegate_id || null,
            },
          }
        : null,
      ...normalize(e),
      effective_route: ec
        ? expenseRoute(ec, parse(e.meta).claimant_id, e.created_by)
        : [],
      effective_approval_index:
        ec &&
        JSON.stringify(parse(e.meta).route) !==
          JSON.stringify(
            expenseRoute(ec, parse(e.meta).claimant_id, e.created_by),
          )
          ? 0
          : parse(e.meta).approvalIndex || 0,
      paid: payRows
        .filter((p) => p.expense_id === e.id)
        .reduce((s, p) => s + p.amount, 0),
    };
    if (!fieldVisible(c.u, "expenses", "amount", e, c.bundles)) {
      delete r.amount;
      delete r.tax;
      delete r.paid;
      r.amount_hidden = true;
    }
    return r;
  });
  const modules = Object.keys(RESOURCES).filter((r) =>
    maySeeModule(c.u, r, c.bundles),
  );
  if (projects.length && !modules.includes("projects"))
    modules.push("projects");
  const ownNotifications = (
    await all(
      db,
      "SELECT * FROM nl_notifications WHERE member_id=? AND channel=? ORDER BY created DESC LIMIT 80",
      c.u.id,
      "in_app",
    )
  ).filter((n) => {
    const r = (
      n.resource === "tasks"
        ? taskRows
        : n.resource === "expenses"
          ? expenseRows
          : n.resource === "advances"
            ? advanceRows
            : projectRows
    ).find((r) => r.id === n.entity_id);
    return r && c.can(n.resource, "view", r);
  });
  const audits = c.can("audit", "view")
    ? (
        await all(db, "SELECT * FROM nl_audit ORDER BY created DESC LIMIT 100")
      ).map((a) => ({ ...a, detail: "" }))
    : [];
  return {
    user: normalize({ ...c.u, email: c.u.email }),
    modules,
    effective_grants: effectiveGrants(c.u, c.bundles),
    projects,
    advances,
    advanceEntries: entries.filter((e) =>
      advances.some((a) => a.id === e.advance_id),
    ),
    committees: visibleCommittees.map((r) => ({
      ...r,
      members: parse(r.members, []),
      statuses: TASK_FLOW,
      config: committeeConfig(r),
    })),
    tasks: tasks.map(normalize),
    expenses: permittedExpenses,
    payments: payRows.filter((p) =>
      permittedExpenses.some((e) => e.id === p.expense_id && !e.amount_hidden),
    ),
    suppliers: supplierRows
      .filter((r) => c.can("suppliers", "view", r))
      .map((r) => {
        const n = normalize(r);
        if (n.meta.media_profile)
          n.meta.media_profile = mediaForReader(c, n.meta.media_profile);
        if (!c.can("suppliers", "edit", r)) {
          delete n.meta.iban;
          delete n.meta.bank_name;
          delete n.meta.beneficiary;
        }
        return n;
      }),
    assets: visibleAssets,
    movements: movements.filter((m) =>
      visibleAssets.some((a) => a.id === m.asset_id),
    ),
    files: visibleFiles.map(normalize),
    people,
    members: c.can("users", "view")
      ? memberRows.map((m) => {
          const u = normalize(m);
          if (!fieldVisible(c.u, "users", "phone", m, c.bundles))
            u.phone = null;
          return u;
        })
      : [],
    bundles: c.can("users", "manage")
      ? c.bundles.map((b) => ({ ...b, grants: parse(b.grants, []) }))
      : [],
    settings: {
      ...c.settings,
      approval:
        c.can("settings", "view") || c.can("expenses", "create")
          ? c.settings.approval
          : { allowSelf: false, route: [] },
    },
    settings_version: c.settingsVersion,
    notifications: ownNotifications,
    audit: audits,
    guides: (await all(db, "SELECT * FROM nl_guides ORDER BY created DESC"))
      .filter(
        (g) =>
          c.can("documents", "view", g) ||
          (g.created_by === c.u.id &&
            c.can("assistant", "view", { project_id: g.project_id })),
      )
      .map((g) => ({ ...g, content: parse(g.content) })),
    approvalCandidates: c.can("users", "manage")
      ? memberRows
          .filter((m) => m.status === "active")
          .map((m) => {
            const u = withCommittees(m, c.committees);
            const qualifies = (scope) =>
              ["view", "approve"].every((a) =>
                permitted(u, "expenses", a, scope, c.bundles),
              );
            return {
              id: m.id,
              name: m.name,
              projects: projectRows
                .filter((p) => qualifies({ project_id: p.id }))
                .map((p) => p.id),
              committees: c.committees
                .filter((k) =>
                  qualifies({ project_id: k.project_id, committee_id: k.id }),
                )
                .map((k) => k.id),
            };
          })
      : [],
    integrations: integrationStatus(env),
    server_time: now(),
  };
}
function ensureGrantAccess(c, g) {
  if (g.effect !== "allow") return;
  const k =
    g.scope === "committee"
      ? c.committees.find((k) => k.id === g.committeeId)
      : null;
  const target =
    g.scope === "committee"
      ? {
          id: k?.id || g.committeeId,
          committee_id: g.committeeId,
          project_id: k?.project_id || g.projectId,
        }
      : g.scope === "project"
        ? { id: g.projectId, project_id: g.projectId }
        : g.scope === "assigned"
          ? { created_by: c.u.id, assignee_id: c.u.id }
          : null;
  if (!c.can(g.resource, g.action, target))
    fail("لا يمكنك منح صلاحية خارج حدود وصولك", 403);
  // An expiring grant cannot be converted into a permanent delegated grant.
  const end = g.expires ? Date.parse(g.expires) : Infinity;
  const longLived = effectiveGrants(c.u, c.bundles).filter(
    (x) => x.effect === "allow" && (!x.expires || Date.parse(x.expires) >= end),
  );
  if (
    !permitted(
      { ...c.u, grants: longLived, bundles: [], committeeGrants: [] },
      g.resource,
      g.action,
      target,
      [],
    )
  )
    fail("لا يمكنك منح صلاحية لمدة أطول من صلاحيتك", 403);
  const scopeOverlap = (d) => {
    if (
      !g.scope ||
      g.scope === "all" ||
      !d.scope ||
      d.scope === "all" ||
      d.scope === "assigned" ||
      g.scope === "assigned"
    )
      return true;
    if (d.scope === g.scope)
      return d.scope === "project"
        ? d.projectId === g.projectId
        : d.committeeId === g.committeeId;
    const ck = c.committees.find(
      (k) => k.id === (g.scope === "committee" ? g.committeeId : d.committeeId),
    );
    return (
      !ck ||
      ck.project_id === (g.scope === "project" ? g.projectId : d.projectId)
    );
  };
  if (
    effectiveGrants(c.u, c.bundles).some(
      (d) =>
        d.effect === "deny" &&
        (!d.expires || Date.parse(d.expires) > Date.now()) &&
        (d.resource === "*" ||
          g.resource === "*" ||
          d.resource === g.resource ||
          d.resource.startsWith(g.resource + ".")) &&
        (d.action === "*" || g.action === "*" || d.action === g.action) &&
        scopeOverlap(d),
    )
  )
    fail("النطاق المطلوب يشمل صلاحيات محجوبة عن حسابك", 403);
}
async function handle(req, env) {
  const url = new URL(req.url),
    p = url.pathname,
    db = env.DB;
  if (!p.startsWith("/api/")) {
    let key = p === "/" || !p.includes(".") ? "/index.html" : p;
    const a = ASSETS[key];
    if (!a) return new Response("Not found", { status: 404 });
    const body =
      a.encoding === "base64"
        ? Uint8Array.from(atob(a.body), (c) => c.charCodeAt(0))
        : a.body;
    return new Response(body, {
      headers: {
        ...policy,
        "Content-Type": a.type,
        "Cache-Control": a.type.startsWith("text/html")
          ? "no-cache"
          : "public,max-age=3600",
      },
    });
  }
  if (p === "/api/health") {
    if (!db || !env.BUCKET) return json({ status: "storage_unavailable" }, 503);
    try {
      await db.prepare("SELECT key FROM nl_settings LIMIT 1").first();
    } catch {
      return json({ status: "storage_unavailable" }, 503);
    }
    return json({ status: "ok" });
  }
  if (!db) fail("تعذر الاتصال بالتخزين. حاول مرة أخرى.", 503);
  if (p === "/api/webhooks/whatsapp") return webhook(req, env);
  if (req.method !== "GET" && req.headers.get("origin") !== url.origin)
    fail("طلب غير موثوق", 403);
  if (p === "/api/auth/status") {
    const siteId = req.headers.get("oai-authenticated-user-id");
    const member = siteId
      ? await one(
          db,
          "SELECT name,status,verified FROM nl_members WHERE site_id=?",
          siteId,
        )
      : null;
    return json({
      ...integrationStatus(env),
      account: member
        ? {
            name: member.name,
            status: member.status,
            verified: !!member.verified,
          }
        : null,
    });
  }
  if (p.startsWith("/api/auth/") && req.method === "POST") {
    const body = await jsonBody(req, 4096);
    if (p === "/api/auth/request")
      return json(await requestOtp(req, env, body));
    if (p === "/api/auth/verify") return json(await verifyOtp(req, env, body));
    fail("المسار غير موجود", 404);
  }
  if (p === "/api/registration/request")
    fail("ابدأ بتوثيق الجوال عبر واتساب لإرسال طلب الانضمام", 400);
  const c = await context(req, env);
  if (p === "/api/agent/history" && req.method === "GET") {
    c.need("assistant", "view");
    return json({ turns: await sanadHistory(env, c, await state(db, c)) });
  }
  if (p === "/api/integrations/status" && req.method === "GET") {
    c.need("settings", "manage");
    return json({
      ...integrationStatus(env),
      deliveries: await all(
        db,
        "SELECT status,count(*) AS count FROM nl_delivery_jobs GROUP BY status",
      ),
    });
  }
  if (p === "/api/readiness" && req.method === "GET") {
    c.need("settings", "manage");
    return json(await readiness(env, c));
  }
  if (p === "/api/agent/transcribe" && req.method === "POST") {
    c.need("assistant", "view");
    if (!integrationStatus(env).voice)
      fail("فعّل خدمة الصوت في إعدادات سَنَد أولًا", 503);
    await limit(db, "voice:" + c.u.id, 20, 3600);
    if (Number(req.headers.get("content-length")) > 12 * 1024 * 1024)
      fail("التسجيل كبير", 413);
    const form = await formBody(req),
      file = form.get("file");
    if (
      !file ||
      typeof file === "string" ||
      file.size > 10 * 1024 * 1024 ||
      !/^audio\//.test(file.type)
    )
      fail("ارفع تسجيلًا صوتيًا حتى 10 ميغابايت");
    const send = new FormData();
    send.set("file", file);
    send.set("model", env.OPENAI_TRANSCRIBE_MODEL);
    send.set("language", "ar");
    const result = await providerFetch(
      env,
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: send,
      },
    );
    if (!result.ok) fail("تعذر تفريغ الصوت. يمكنك كتابة طلبك.", 502);
    return json({
      text: String((await result.json()).text || "").slice(0, 6000),
    });
  }
  if (p === "/api/legacy" && req.method === "GET") {
    c.need("settings", "manage");
    return json(await legacyInfo(db));
  }
  if (p === "/api/state" && req.method === "GET")
    return json(await state(db, c, url.searchParams.get("project") || "", env));
  if (p.startsWith("/api/files/") && req.method === "GET") {
    const f = await one(
      db,
      "SELECT * FROM nl_files WHERE id=?",
      p.split("/").pop(),
    );
    if (!f) fail("المرفق غير متاح", 404);
    await assertFileRead(db, c, f);
    if (f.object_key.startsWith("legacy:")) {
      const old = await one(
        db,
        "SELECT file_data FROM invoices WHERE id=?",
        f.object_key.slice(7),
      );
      if (!old?.file_data) fail("الملف السابق غير متاح", 404);
      return new Response(
        Uint8Array.from(atob(old.file_data), (x) => x.charCodeAt(0)),
        {
          headers: {
            ...policy,
            "Content-Type": f.mime,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
          },
        },
      );
    }
    if (!env.BUCKET) fail("خدمة الملفات غير متاحة", 503);
    const object = await env.BUCKET.get(f.object_key);
    if (!object) fail("تعذر العثور على الملف", 404);
    return new Response(object.body, {
      headers: {
        ...policy,
        "Content-Type": f.mime,
        "Content-Disposition": `${url.searchParams.has("inline") && /^image\/(png|jpeg|webp)$|^audio\//.test(f.mime) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      },
    });
  }
  if (p === "/api/upload" && req.method === "POST") {
    if (!env.BUCKET) fail("خدمة الملفات غير متاحة", 503);
    if (Number(req.headers.get("content-length")) > 12 * 1024 * 1024)
      fail("الحد الأعلى للملف 10 ميغابايت", 413);
    await limit(db, "upload:" + c.u.id, 60, 3600);
    const form = await formBody(req),
      file = form.get("file"),
      resource = String(form.get("resource") || "tasks"),
      entity = String(form.get("entity") || "");
    choice(resource, [
      "tasks",
      "expenses",
      "assets",
      "documents",
      "suppliers",
      "advances",
    ]);
    const purpose = choice(
      String(
        form.get("purpose") ||
          (resource === "expenses" ? "invoice" : "reference"),
      ),
      Object.keys(FILE_PURPOSES),
    );
    const draft = !entity || form.get("attach_later") === "true";
    let r = !entity
      ? {
          project_id: String(form.get("project") || ""),
          committee_id: String(form.get("committee") || ""),
          created_by: c.u.id,
        }
      : await record(db, resource, entity);
    c.need(
      resource,
      purpose === "reimbursement"
        ? "pay"
        : resource === "advances"
          ? !entity
            ? "create"
            : "pay"
          : !entity
            ? "create"
            : "edit",
      r,
    );
    if (
      !file ||
      typeof file === "string" ||
      file.size > 10 * 1024 * 1024 ||
      !file.size
    )
      fail("اختر ملفًا بحجم لا يتجاوز 10 ميغابايت");
    const mime = file.type.split(";")[0];
    choice(mime, [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "audio/webm",
      "audio/ogg",
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "video/webm",
      "video/mp4",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ]);
    const bytes = await file.arrayBuffer();
    const sig = new Uint8Array(bytes).slice(0, 12),
      str = String.fromCharCode(...sig);
    if (
      (mime === "video/mp4" && str.slice(4, 8) !== "ftyp") ||
      (mime === "application/pdf" && !str.startsWith("%PDF-")) ||
      (mime === "image/png" && !str.startsWith("\x89PNG")) ||
      (mime === "image/jpeg" && !(sig[0] === 255 && sig[1] === 216)) ||
      (mime === "image/webp" &&
        !(str.startsWith("RIFF") && str.endsWith("WEBP"))) ||
      (mime.startsWith("application/vnd.") && !str.startsWith("PK"))
    )
      fail("الملف لا يطابق نوعه");
    const id = uid(),
      key = "files/" + id;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO nl_files(id,entity_type,entity_id,name,mime,size,object_key,created_by,created) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            draft ? "draft" : resource,
            entity || c.u.id,
            string(file.name, 200),
            mime,
            file.size,
            key,
            c.u.id,
            now(),
          ),
        db.prepare("UPDATE nl_files SET meta=? WHERE id=?").bind(
          JSON.stringify({
            purpose,
            pending_resource: draft ? resource : undefined,
          }),
          id,
        ),
        audit(
          db,
          c.u,
          "إرفاق ملف",
          resource,
          entity || id,
          r.project_id,
          file.name,
        ),
      ]);
    } catch (e) {
      await env.BUCKET.delete(key);
      throw e;
    }
    return json({ id, name: file.name, mime, size: file.size });
  }
  if (/^\/api\/guides\/[^/]+\/export$/.test(p) && req.method === "GET") {
    const g = await record(db, "documents", p.split("/")[3]);
    const t = g.task_id ? await record(db, "tasks", g.task_id) : null;
    if (!(
      c.can("documents", "view", g) ||
      (t && c.can("tasks", "view", t)) ||
      (g.created_by === c.u.id && c.can("assistant", "view", g))
    ))
      fail("الدليل غير متاح", 403);
    if (!(
      c.can("documents", "export", g) ||
      (t && c.can("tasks", "export", t))
    ))
      fail("ليس لديك صلاحية تصدير الدليل", 403);
    return json({ ...g, content: parse(g.content) });
  }
  if (p.startsWith("/api/tasks/") && req.method === "GET") {
    const t = await record(db, "tasks", p.split("/").pop());
    c.need("tasks", "view", t);
    return json({
      task: normalize(t),
      comments: await all(
        db,
        "SELECT * FROM nl_comments WHERE task_id=? ORDER BY created",
        t.id,
      ),
      files: await all(
        db,
        "SELECT id,name,mime,size,created,meta FROM nl_files WHERE entity_type='tasks' AND entity_id=?",
        t.id,
      ),
      guides: (
        await all(
          db,
          "SELECT * FROM nl_guides WHERE task_id=? ORDER BY version DESC",
          t.id,
        )
      ).map((g) => ({ ...g, content: parse(g.content) })),
    });
  }
  if (p === "/api/export" && req.method === "GET") {
    const type = choice(url.searchParams.get("type"), [
      "tasks",
      "expenses",
      "advances",
      "projects",
      "assets",
      "suppliers",
      "audit",
      "media",
    ]);
    const st = await state(db, c, url.searchParams.get("project") || "");
    const resource = type === "media" ? "suppliers" : type;
    let rows = st[resource] || [];
    rows = rows.filter((r) => c.can(resource, "export", r));
    if (type === "media") rows = rows.filter((r) => r.meta?.media_profile);
    if (
      !rows.length &&
      !c.can(resource, "export", {
        project_id: url.searchParams.get("project") || "",
        committee_id: url.searchParams.get("committee") || "",
      })
    )
      fail("ليس لديك صلاحية التصدير", 403);
    const ids = url.searchParams.get("ids")?.split(",");
    if (ids) rows = rows.filter((r) => ids.includes(r.id));
    return json({
      type,
      rows:
        type === "media"
          ? rows.flatMap((r) => {
              const m = r.meta.media_profile;
              return (m.engagements.length ? m.engagements : [{}]).map((e) => ({
                name: r.name,
                role: m.role,
                phone: r.phone,
                accounts: m.accounts
                  .map(
                    (a) =>
                      a.platform +
                      ": " +
                      a.handle +
                      " " +
                      (a.followers ?? "") +
                      " @ " +
                      a.observed_on,
                  )
                  .join(" | "),
                ...e,
              }));
            })
          : rows,
      advanceEntries:
        type === "advances"
          ? st.advanceEntries.filter((e) =>
              rows.some((a) => a.id === e.advance_id),
            )
          : [],
      linkedExpenses:
        type === "advances"
          ? st.expenses.filter((e) =>
              rows.some((a) => a.id === e.meta?.advance_id),
            )
          : [],
      people: st.people,
      projects: st.projects,
      suppliers: st.suppliers,
      payments: st.payments.filter((p) =>
        rows.some((r) => r.id === p.expense_id),
      ),
      committees: st.committees,
      settings: st.settings,
      as_of: now(),
    });
  }
  if (req.method !== "POST") fail("المسار غير موجود", 404);
  if (Number(req.headers.get("content-length")) > 1048576)
    fail("الطلب أكبر من الحد المسموح", 413);
  const b = await jsonBody(req);
  const replayKey = req.headers.get("idempotency-key");
  if (replayKey) {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(replayKey)) fail("معرف الطلب غير صالح");
    const prior = await one(
      db,
      "SELECT * FROM nl_receipts WHERE id=?",
      replayKey,
    );
    if (prior) {
      const hash = await digest(req.url + "|" + JSON.stringify(b));
      if (prior.actor !== c.u.id || prior.hash !== hash)
        fail("معرف الطلب مستخدم لعملية مختلفة", 409);
      return json(parse(prior.result));
    }
  }
  if (p === "/api/legacy/import") {
    c.need("settings", "manage");
    c.need("projects", "create");
    const copy = await legacyCopy(db, c.u, c.settings);
    return commit(
      db,
      c,
      req,
      b,
      [
        ...copy.stmts,
        audit(db, c.u, "استيراد السجلات السابقة", "settings", "legacy"),
      ],
      { ok: true, counts: copy.counts },
    );
  }
  if (p === "/api/committees/save") {
    const old = b.id ? await record(db, "committees", b.id) : null;
    const project = await record(
      db,
      "projects",
      old?.project_id || b.project_id,
    );
    if (project.status === "closed") fail("المشروع مغلق");
    c.need(
      "committees",
      old ? "edit" : "create",
      old || { project_id: project.id },
    );
    const id = old?.id || uid();
    const members =
      b.members === undefined ? parse(old?.members, []) : b.members;
    if (
      !Array.isArray(members) ||
      members.length > 200 ||
      new Set(members.map((m) => m.id)).size !== members.length
    )
      fail("راجع قائمة أعضاء اللجنة");
    const manager =
      b.manager_id === undefined
        ? old?.manager_id || null
        : b.manager_id || null;
    if (
      JSON.stringify(members) !== JSON.stringify(parse(old?.members, [])) ||
      manager !== (old?.manager_id || null)
    ) {
      c.need("users", "manage");
      for (const m of members) {
        await record(db, "users", m.id);
        string(m.role, 80);
        validateGrants(m.grants);
        for (const g of m.grants) {
          if (
            g.resource === "*" ||
            ["users", "settings", "projects", "audit"].includes(g.resource)
          )
            fail("هذه الصلاحية تُدار من مصفوفة وصول العضو العامة");
          ensureGrantAccess(c, {
            ...g,
            scope: "committee",
            committeeId: id,
            projectId: project.id,
          });
        }
      }
      if (manager && !members.some((m) => m.id === manager))
        fail("مسؤول اللجنة يجب أن يكون ضمن أعضائها");
      if (manager && manager !== old?.manager_id)
        for (const g of MEMBER_PRESETS.manager)
          ensureGrantAccess(c, {
            ...g,
            scope: "committee",
            committeeId: id,
            projectId: project.id,
          });
    }
    if (manager) await activeMember(db, manager);
    const statuses = TASK_FLOW;
    const cfg = b.config || committeeConfig(old);
    if (JSON.stringify(cfg) !== JSON.stringify(committeeConfig(old))) {
      c.need("users", "manage");
      if (!Array.isArray(cfg.budgetLines) || cfg.budgetLines.length > 100)
        fail("راجع بنود الصرف");
      cfg.budgetLines = cfg.budgetLines.map((l) => ({
        id: string(l.id, 80),
        name: string(l.name, 120),
        budget: money(l.budget || 0, true),
        active: l.active !== false,
      }));
      if (
        new Set(cfg.budgetLines.map((l) => l.id)).size !==
        cfg.budgetLines.length
      )
        fail("بند صرف مكرر");
      if (!Array.isArray(cfg.tags || [])) fail("راجع قائمة الوسوم");
      cfg.tags = (cfg.tags || []).slice(0, 30).map((t) => string(t, 60));
    }
    cfg.second_approver_id =
      b.second_approver_id === undefined
        ? secondApprover(old)
        : b.second_approver_id || null;
    if (cfg.second_approver_id !== secondApprover(old))
      c.need("users", "manage");
    if (cfg.second_approver_id) {
      if (cfg.second_approver_id === manager)
        fail(
          "اختر شخصًا آخر للاعتماد الثاني؛ لا يجتمع الاعتمادان لدى شخص واحد",
        );
      const reviewer = withCommittees(
        await activeMember(db, cfg.second_approver_id),
        c.committees,
      );
      const scope = { project_id: project.id, committee_id: id };
      if (
        !["view", "approve"].every((a) =>
          permitted(reviewer, "expenses", a, scope, c.bundles),
        )
      )
        fail(
          "امنح المستخدم مشاهدة المصروفات واعتمادها ضمن نطاق هذه اللجنة من صلاحياته أولًا",
        );
    }
    cfg.review_delegate_id =
      b.review_delegate_id === undefined
        ? committeeConfig(old).review_delegate_id || null
        : b.review_delegate_id || null;
    if (
      cfg.review_delegate_id !==
      (committeeConfig(old).review_delegate_id || null)
    )
      c.need("users", "manage");
    if (cfg.review_delegate_id) {
      if ([manager, cfg.second_approver_id].includes(cfg.review_delegate_id))
        fail("بديل الاعتماد يجب أن يكون شخصًا ثالثًا");
      const delegate = withCommittees(
        await activeMember(db, cfg.review_delegate_id),
        c.committees,
      );
      if (
        !["view", "approve"].every((action) =>
          permitted(
            delegate,
            "expenses",
            action,
            { project_id: project.id, committee_id: id },
            c.bundles,
          ),
        )
      )
        fail("امنح البديل مشاهدة المصروفات واعتمادها في نطاق اللجنة أولًا");
    }
    const vals = [
      string(b.name, 120),
      string(b.description, 2000, true),
      manager,
      JSON.stringify(members),
      JSON.stringify(statuses),
    ];
    const stmt = old
      ? db
          .prepare(
            "UPDATE nl_committees SET name=?,description=?,manager_id=?,members=?,statuses=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(...vals, id, b.version)
      : db
          .prepare(
            "INSERT INTO nl_committees(id,project_id,name,description,manager_id,members,statuses,created_by,created) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .bind(id, project.id, ...vals, c.u.id, now());
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        db
          .prepare("UPDATE nl_committees SET config=? WHERE id=?")
          .bind(JSON.stringify(cfg), id),
        audit(
          db,
          c.u,
          old ? "تعديل لجنة وصلاحياتها" : "إنشاء لجنة",
          "committees",
          id,
          project.id,
        ),
      ],
      { id },
      !!old,
    );
  }
  if (p === "/api/tasks/request") {
    const parent = await record(db, "tasks", b.parent_id);
    c.need("tasks", "view", parent);
    c.need("tasks", "edit", parent);
    const project = await record(db, "projects", parent.project_id);
    if (project.status === "closed") fail("المشروع مغلق");
    const recipient = await activeMember(db, b.recipient_id);
    const id = uid(),
      board = taskStatuses(c.settings, c.committees, parent);
    const meta = {
      committee_id: parse(parent.meta).committee_id || null,
      checklist: [],
      tags: [],
      dependencies: [],
      collaborators: [c.u.id],
      request: {
        kind: choice(b.kind, ["supplies", "person", "decision", "contact"]),
        stage: "new",
        requester: c.u.id,
        recipient: recipient.id,
        history: [
          {
            stage: "new",
            by: c.u.id,
            at: now(),
            note: string(b.description, 4000),
          },
        ],
      },
    };
    const candidate = {
      id,
      project_id: parent.project_id,
      assignee_id: recipient.id,
      created_by: c.u.id,
      meta,
    };
    if (
      !permitted(
        withCommittees(recipient, c.committees),
        "tasks",
        "view",
        candidate,
        c.bundles,
      ) ||
      !permitted(
        withCommittees(recipient, c.committees),
        "tasks",
        "edit",
        candidate,
        c.bundles,
      )
    )
      fail("اختر عضوًا يملك مشاهدة وتنفيذ الطلب داخل اللجنة");
    const stmt = db
      .prepare(
        "INSERT INTO nl_tasks(id,project_id,title,description,assignee_id,due,priority,status,parent_id,meta,created_by,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        parent.project_id,
        string(b.title, 250),
        string(b.description, 4000),
        recipient.id,
        validDate(b.due, true),
        choice(
          b.priority || "normal",
          c.settings.priorities.map((x) => x.id),
        ),
        board.find((s) => !s.done).id,
        parent.id,
        JSON.stringify(meta),
        c.u.id,
        now(),
        now(),
      );
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        audit(db, c.u, "طلب مساندة مرتبط", "tasks", id, parent.project_id),
        ...notifications(
          db,
          c.settings,
          recipient.id,
          "طلب مساندة ينتظر استلامك",
          b.title,
          "tasks",
          id,
          parent.project_id,
        ),
      ],
      { id },
    );
  }
  if (p === "/api/tasks/request-stage") {
    const task = await record(db, "tasks", b.id);
    c.need("tasks", "view", task);
    c.need("tasks", "edit", task);
    if ((await record(db, "projects", task.project_id)).status === "closed")
      fail("المشروع مغلق");
    const meta = parse(task.meta),
      r = meta.request;
    if (!r) fail("هذه المهمة ليست طلب مساندة");
    const allowed = {
      new: ["accepted"],
      accepted: ["fulfilling"],
      fulfilling: ["partial", "delivered"],
      partial: ["partial", "delivered"],
      delivered: ["closed", "fulfilling"],
    };
    if (!(allowed[r.stage] || []).includes(b.stage))
      fail("انتقال غير متاح من المرحلة الحالية");
    const responsible =
      r.stage === "delivered" ? r.requester : task.assignee_id;
    if (c.u.id !== responsible)
      fail("هذه الخطوة لدى المسؤول الحالي عن التسلسل", 403);
    const note = string(b.note, 2000);
    const recipient = await activeMember(
      db,
      b.stage === "delivered" ? r.requester : r.recipient,
    );
    const target = { ...task, assignee_id: recipient.id };
    if (
      !permitted(
        withCommittees(recipient, c.committees),
        "tasks",
        "edit",
        target,
        c.bundles,
      )
    )
      fail(
        "المسؤول التالي لم يعد يملك وصولًا مناسبًا؛ اطلب من الأدمن تحديث الصلاحيات",
      );
    r.stage = b.stage;
    r.history.push({ stage: b.stage, by: c.u.id, at: now(), note });
    const board = taskStatuses(c.settings, c.committees, task),
      status =
        b.stage === "closed"
          ? board.find((s) => s.done).id
          : board.find((s) => !s.done).id;
    const stmt = db
      .prepare(
        "UPDATE nl_tasks SET meta=?,assignee_id=?,status=?,updated=?,version=version+1 WHERE id=? AND version=?",
      )
      .bind(
        JSON.stringify(meta),
        recipient.id,
        status,
        now(),
        task.id,
        b.version,
      );
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        audit(
          db,
          c.u,
          "تحديث تسلسل المساندة",
          "tasks",
          task.id,
          task.project_id,
        ),
        ...notifications(
          db,
          c.settings,
          recipient.id,
          b.stage === "delivered"
            ? "أكد استلام طلبك"
            : b.stage === "closed"
              ? "تم تأكيد الاستلام وإغلاق الطلب"
              : "تحديث طلب المساندة",
          task.title,
          "tasks",
          task.id,
          task.project_id,
        ),
      ],
      { id: task.id },
      true,
    );
  }

  if (p === "/api/advances/create" || p === "/api/advances/entry") {
    const old = p.endsWith("/entry")
      ? await record(db, "advances", b.id)
      : null;
    const pr = await record(db, "projects", old?.project_id || b.project_id);
    c.need("advances", old ? "pay" : "create", old || { project_id: pr.id });
    if (pr.status === "closed") fail("المشروع مغلق");
    const member = await activeMember(db, old?.assignee_id || b.assignee_id);
    const cid = old ? parse(old.meta).committee_id : b.committee_id;
    if (!old) {
      const committee = await record(db, "committees", cid);
      if (
        committee.project_id !== pr.id ||
        !parse(committee.members, []).some((m) => m.id === member.id)
      )
        fail("اختر عضوًا من اللجنة المرتبطة بالعهدة");
      c.need("committees", "view", committee);
    }
    const files = b.files || [];
    if (!files.length) fail("أرفق إثبات تسليم أو استرداد المبلغ");
    for (const id of files) {
      const f = await one(db, "SELECT * FROM nl_files WHERE id=?", id);
      if (
        !f ||
        f.created_by !== c.u.id ||
        f.entity_type !== "draft" ||
        parse(f.meta).purpose !== "handover" ||
        !/^application\/pdf$|^image\//.test(f.mime)
      )
        fail("إثبات حركة العهدة غير صالح");
    }
    const id = old?.id || uid(),
      entry = uid(),
      type = old ? choice(b.type, ["fund", "return"]) : "fund",
      amount = money(b.amount),
      date = validDate(b.date),
      reference = string(b.reference, 200),
      method = choice(b.payment_method || "transfer", [
        "transfer",
        "cash",
        "card",
      ]),
      meta = {
        committee_id: cid,
        purpose: old ? parse(old.meta).purpose : string(b.purpose, 1000),
        settlement_due: old
          ? parse(old.meta).settlement_due
          : validDate(b.settlement_due, true),
      };
    const stmts = [];
    if (!old)
      stmts.push(
        db
          .prepare(
            "INSERT INTO nl_advances(id,project_id,assignee_id,title,created_by,created,meta) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            pr.id,
            member.id,
            string(b.title, 200),
            c.u.id,
            now(),
            JSON.stringify(meta),
          ),
      );
    stmts.push(
      db
        .prepare(
          "INSERT INTO nl_advance_entries(id,advance_id,type,amount,date,payment_id,reference,created_by,created,meta) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ?='fund' OR (SELECT COALESCE(SUM(CASE WHEN type='fund' THEN amount ELSE -amount END),0) FROM nl_advance_entries WHERE advance_id=?)>=?",
        )
        .bind(
          entry,
          id,
          type,
          amount,
          date,
          null,
          reference,
          c.u.id,
          now(),
          JSON.stringify({
            payment_method: method,
            files,
            note: string(b.note, 1000, true),
          }),
          type,
          id,
          amount,
        ),
      db.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(uid()),
      ...(await fileBindings(db, c, files, "advances", id)),
      audit(
        db,
        c.u,
        type === "fund" ? "تسليم مبلغ عهدة موثق" : "استرداد رصيد عهدة موثق",
        "advances",
        id,
        pr.id,
      ),
      ...notifications(
        db,
        c.settings,
        member.id,
        type === "fund" ? "سُجل تسليم عهدتك المالية" : "سُجل استرداد من عهدتك",
        `${string(b.title || old?.title)} · ${amount / 100} ر.س`,
        "advances",
        id,
        pr.id,
      ),
    );
    return commit(db, c, req, b, stmts, { id });
  }

  if (p === "/api/projects/save") {
    const r = b.id ? await record(db, "projects", b.id) : null;
    c.need("projects", r ? "edit" : "create", r || {});
    const id = r?.id || uid(),
      start = validDate(b.start, true),
      due = validDate(b.due, true);
    if (start && due && due < start) fail("تاريخ النهاية يسبق البداية");
    if (b.status === "closed" && r?.status !== "closed")
      c.need("projects", "archive", r || {});
    const budget = money(
      b.budget ?? (r?.budget === undefined ? 0 : r.budget / 100),
      true,
    );
    if (
      !fieldVisible(c.u, "projects", "budget", r || {}, c.bundles) &&
      budget !== (r?.budget || 0)
    )
      fail("ليس لديك صلاحية تعديل الميزانية", 403);
    const vals = [
      string(b.title),
      string(b.description, 3000, true),
      string(b.season, 120, true),
      choice(b.status || "active", ["planned", "active", "onhold", "closed"]),
      start,
      due,
      budget,
      JSON.stringify({
        ...parse(r?.meta),
        supervisor_id: null,
        site_location:
          b.site_location === undefined
            ? parse(r?.meta).site_location || null
            : validateLocation(b.site_location),
        sections: (b.sections || parse(r?.meta).sections || []).slice(0, 30),
      }),
    ];
    const stmt = r
      ? db
          .prepare(
            "UPDATE nl_projects SET title=?,description=?,season=?,status=?,start=?,due=?,budget=?,meta=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(...vals, id, b.version)
      : db
          .prepare(
            "INSERT INTO nl_projects(id,title,description,season,status,start,due,budget,meta,created_by,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(id, ...vals, c.u.id, now());
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        audit(
          db,
          c.u,
          r ? "تعديل مشروع" : "إنشاء مشروع",
          "projects",
          id,
          id,
          b.title,
        ),
      ],
      { id },
      !!r,
    );
  }
  if (p === "/api/tasks/save") {
    const old = b.id ? await record(db, "tasks", b.id) : null;
    const project = await record(
      db,
      "projects",
      b.project_id || old?.project_id,
    );
    if (old && ["review", "done"].includes(old.status))
      fail("أعد المهمة إلى التنفيذ قبل تعديل تفاصيلها");
    if (project.status === "closed") fail("المشروع مغلق");
    const committeeId =
      b.meta?.committee_id ?? parse(old?.meta).committee_id ?? null;
    const committee = committeeId
      ? await record(db, "committees", committeeId)
      : null;
    if (!committee)
      fail("اختر لجنة للمهمة؛ تُحدد منها عضوية المنفذ ومدير الاعتماد");
    if (committee && committee.project_id !== project.id)
      fail("اللجنة لا تنتمي إلى المشروع");
    if (
      old &&
      parse(old.meta).committee_id &&
      committeeId !== parse(old.meta).committee_id
    )
      fail(
        "نقل المهمة إلى لجنة أخرى يحتاج إسنادًا جديدًا؛ أنشئ طلبًا مرتبطًا بدل تغيير لجنة المهمة",
      );
    const boardStatuses = taskStatuses(c.settings, c.committees, {
      committee_id: committeeId,
    });

    c.need(
      "tasks",
      old ? "edit" : "create",
      old || {
        project_id: project.id,
        committee_id: committeeId,
        created_by: c.u.id,
      },
    );
    if (old && old.project_id !== project.id)
      fail("نقل المهمة بين المشاريع غير متاح من هذا النموذج");
    const id = old?.id || uid(),
      assignee = b.assignee_id || null;
    await activeMember(db, assignee, true);
    if (assignee !== (old?.assignee_id || null))
      c.need(
        "tasks",
        "assign",
        old || {
          project_id: project.id,
          committee_id: committeeId,
          created_by: c.u.id,
        },
      );
    const start = validDate(b.start, true),
      due = validDate(b.due, true);
    if (start && due && due < start) fail("موعد التسليم يسبق البداية");
    const status = old?.status || "todo";
    if (old && b.status && b.status !== old.status)
      fail("غيّر المرحلة من إجراء المهمة حتى يُطبق تسلسل الاعتماد");
    const meta = validateCustom({ ...parse(old?.meta), ...b.meta }, c.settings);
    meta.committee_id = committeeId;
    meta.flowHistory = parse(old?.meta).flowHistory || [];
    meta.completion_note = parse(old?.meta).completion_note || "";
    if (
      JSON.stringify(meta.request) !== JSON.stringify(parse(old?.meta).request)
    )
      fail("استخدم إجراء طلب المساندة لتغيير التسلسل");
    if (
      old &&
      parse(old.meta).request &&
      (status !== old.status || assignee !== old.assignee_id)
    )
      fail("حدّث الطلب من تسلسل المساندة حتى يُشعر المسؤول الصحيح");
    meta.site_location = validateLocation(meta.site_location);
    meta.outcome = string(meta.outcome, 2000, true);
    meta.reviewer_id = committee.manager_id || null;
    const cfg = committeeConfig(committee);
    meta.type = choice(
      meta.type || "execution",
      TASK_TYPES.map((t) => t.id),
    );
    const controlledSteps = {
      execution: [
        "مراجعة دليل التنفيذ والمطلوب",
        "إتمام العمل المطلوب",
        "تجهيز ما يثبت الإنجاز",
      ],
      delivery: [
        "تأكيد العدد والمواصفات",
        "فحص التجهيز والاستلام",
        "توثيق نتيجة الاستلام",
      ],
      coordination: [
        "تأكيد الأطراف والموعد",
        "إتمام التنسيق والمتابعة",
        "توثيق النتيجة المتفق عليها",
      ],
      content: [
        "مراجعة المتطلبات والمراجع",
        "تجهيز النسخة المطلوبة",
        "إرفاق النسخة النهائية للمراجعة",
      ],
    };
    if (!old)
      meta.checklist = controlledSteps[meta.type].map((text) => ({
        id: uid(),
        text,
        done: false,
      }));
    else if (
      JSON.stringify((meta.checklist || []).map((x) => [x.id, x.text])) !==
      JSON.stringify(
        (parse(old.meta).checklist || []).map((x) => [x.id, x.text]),
      )
    )
      fail("خطوات المهمة ثابتة؛ حدّث الإنجاز من قائمة التحقق");
    if ((meta.tags || []).some((tag) => !cfg.tags.includes(tag)))
      fail("اختر وسومًا من القائمة المعتمدة للجنة");
    meta.section = "";
    meta.tags = Array.isArray(meta.tags)
      ? meta.tags.slice(0, 20).map((x) => string(x, 80))
      : [];
    meta.section = "";
    meta.checklist = Array.isArray(meta.checklist)
      ? meta.checklist.slice(0, 100).map((x) => ({
          id: x.id || uid(),
          text: string(x.text, 400),
          done: !!x.done,
        }))
      : [];
    meta.collaborators = Array.isArray(meta.collaborators)
      ? [...new Set(meta.collaborators)].slice(0, 30)
      : [];
    if (
      JSON.stringify(meta.collaborators) !==
      JSON.stringify(parse(old?.meta).collaborators || [])
    )
      c.need(
        "tasks",
        "assign",
        old || {
          project_id: project.id,
          committee_id: committeeId,
          created_by: c.u.id,
        },
      );
    for (const m of meta.collaborators) await activeMember(db, m);
    meta.dependencies = Array.isArray(meta.dependencies)
      ? meta.dependencies.slice(0, 30)
      : [];
    for (const dep of meta.dependencies) {
      if (dep === id) fail("المهمة لا تعتمد على نفسها");
      const d = await record(db, "tasks", dep);
      c.need("tasks", "view", d);
      if (d.project_id !== project.id) fail("اختر اعتماديات من المشروع نفسه");
      const seen = new Set([dep]),
        queue = [...(parse(d.meta).dependencies || [])];
      while (queue.length) {
        const next = queue.pop();
        if (next === id) fail("الاعتماديات تشكل حلقة مغلقة");
        if (seen.has(next)) continue;
        seen.add(next);
        const nx = await record(db, "tasks", next);
        queue.push(...(parse(nx.meta).dependencies || []));
      }
    }
    if (boardStatuses.find((s) => s.id === status)?.done) {
      for (const dep of meta.dependencies) {
        const dt = await record(db, "tasks", dep);
        if (
          !taskStatuses(c.settings, c.committees, dt).find(
            (s) => s.id === dt.status,
          )?.done
        )
          fail("أكمل المهام السابقة المرتبطة قبل إغلاق المهمة");
      }
      if (meta.checklist.some((x) => !x.done))
        fail("أكمل قائمة التحقق قبل إغلاق المهمة");
    }
    for (const memberId of [
      ...new Set([assignee, ...meta.collaborators].filter(Boolean)),
    ]) {
      const m = await activeMember(db, memberId);
      if (
        committee &&
        !parse(committee.members, []).some((x) => x.id === memberId) &&
        !permitted(m, "tasks", "assign", null, c.bundles)
      )
        fail("اختر مسؤولًا أو مشاركًا من أعضاء اللجنة");
      if (
        !permitted(
          withCommittees(m, c.committees),
          "tasks",
          "view",
          {
            id,
            project_id: project.id,
            assignee_id: assignee,
            created_by: old?.created_by || c.u.id,
            meta,
          },
          c.bundles,
        )
      )
        fail(
          "العضو المحدد لا يملك مشاهدة المهمة. امنحه وصولًا مناسبًا قبل الإسناد",
        );
    }
    const parentId =
      b.parent_id === undefined ? old?.parent_id || null : b.parent_id || null;
    if (parentId) {
      const parent = await record(db, "tasks", parentId);
      c.need("tasks", "view", parent);
      if (parent.id === id || parent.project_id !== project.id)
        fail("المهمة الأم غير صالحة");
      let up = parent;
      const seenParents = new Set([id]);
      while (up) {
        if (seenParents.has(up.id)) fail("المهام الفرعية تشكل حلقة مغلقة");
        seenParents.add(up.id);
        up = up.parent_id ? await record(db, "tasks", up.parent_id) : null;
      }
    }
    const vals = [
      project.id,
      string(b.title, 250),
      string(b.description, 12000, true),
      assignee,
      start,
      due,
      choice(
        b.priority || "normal",
        c.settings.priorities.map((x) => x.id),
      ),
      status,
      parentId,
      JSON.stringify(meta),
    ];
    const stmt = old
      ? db
          .prepare(
            "UPDATE nl_tasks SET project_id=?,title=?,description=?,assignee_id=?,start=?,due=?,priority=?,status=?,parent_id=?,meta=?,updated=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(...vals, now(), id, b.version)
      : db
          .prepare(
            "INSERT INTO nl_tasks(id,project_id,title,description,assignee_id,start,due,priority,status,parent_id,meta,created_by,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(id, ...vals, c.u.id, now(), now());
    const stmts = [
      stmt,
      ...(await fileBindings(db, c, b.files || [], "tasks", id)),
      audit(
        db,
        c.u,
        old ? "تحديث مهمة" : "إنشاء مهمة",
        "tasks",
        id,
        project.id,
        b.title,
      ),
    ];
    if (assignee && assignee !== old?.assignee_id)
      stmts.push(
        ...notifications(
          db,
          c.settings,
          assignee,
          "أُسندت إليك مهمة",
          b.title,
          "tasks",
          id,
          project.id,
        ),
      );
    if (meta.reviewer_id && status === "review" && old?.status !== status)
      stmts.push(
        ...notifications(
          db,
          c.settings,
          meta.reviewer_id,
          "مهمة بانتظار مراجعتك",
          b.title,
          "tasks",
          id,
          project.id,
        ),
      );
    return commit(db, c, req, b, stmts, { id }, !!old);
  }
  if (p === "/api/tasks/reorder") {
    const t = await record(db, "tasks", b.id);
    c.need("tasks", "edit", t);
    c.need("tasks", "view", t);
    if ((await record(db, "projects", t.project_id)).status === "closed")
      fail("المشروع مغلق");
    const rank = Number(b.rank);
    if (!Number.isFinite(rank) || Math.abs(rank) > 1e12) fail("ترتيب غير صالح");
    return commit(
      db,
      c,
      req,
      b,
      [
        db
          .prepare(
            "UPDATE nl_tasks SET meta=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(JSON.stringify({ ...parse(t.meta), rank }), t.id, b.version),
        audit(db, c.u, "ترتيب المهمة داخل العمود", "tasks", t.id, t.project_id),
      ],
      { id: t.id },
      true,
    );
  }
  if (p === "/api/tasks/transition") {
    const t = await record(db, "tasks", b.id);
    c.need("tasks", "view", t);
    c.need("tasks", "edit", t);
    if (parse(t.meta).request) fail("استخدم تسلسل طلب المساندة");
    const committee = await record(
        db,
        "committees",
        parse(t.meta).committee_id,
      ),
      meta = parse(t.meta);
    if ((await record(db, "projects", t.project_id)).status === "closed")
      fail("المشروع مغلق");
    const next = choice(
      b.status,
      TASK_FLOW.map((s) => s.id),
    );
    const allowed = {
      todo: ["doing", "blocked"],
      doing: ["blocked", "review"],
      blocked: ["doing", "review"],
      review: ["done", "doing"],
      done: ["doing"],
    };
    if (!(allowed[t.status] || ["doing"]).includes(next))
      fail("انتقل حسب تسلسل المهمة: بدء، تنفيذ، مراجعة، ثم اعتماد");
    if (
      (t.status === "review" || t.status === "done") &&
      committee.manager_id !== c.u.id
    )
      fail("قرار الاعتماد أو الإعادة لدى مدير اللجنة", 403);
    if (next === "review") {
      if (!committee.manager_id)
        fail("حدد مدير اللجنة قبل رفع المهمة للمراجعة");
      await activeMember(db, committee.manager_id);
      if ((meta.checklist || []).some((x) => !x.done))
        fail("أكمل خطوات التنفيذ المعتمدة قبل رفعها للمراجعة");
      meta.completion_note = string(b.note, 2000);
    }
    if (next === "done") {
      c.need("tasks", "approve", t);
      for (const id of meta.dependencies || []) {
        const d = await record(db, "tasks", id);
        if (!TASK_FLOW.find((s) => s.id === d.status)?.done)
          fail("أكمل المهام السابقة المرتبطة قبل اعتماد الإنجاز");
      }
      if ((meta.checklist || []).some((x) => !x.done))
        fail("خطوات التنفيذ لم تكتمل");
    }
    if (next === "blocked" || (t.status === "review" && next === "doing"))
      string(b.note, 2000);
    meta.flowHistory = [
      ...(meta.flowHistory || []),
      {
        from: t.status,
        to: next,
        by: c.u.id,
        at: now(),
        note: string(b.note, 2000, true),
      },
    ];
    const recipient =
      next === "review" || next === "blocked"
        ? committee.manager_id
        : t.assignee_id;
    return commit(
      db,
      c,
      req,
      b,
      [
        db
          .prepare(
            "UPDATE nl_tasks SET status=?,meta=?,updated=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(next, JSON.stringify(meta), now(), t.id, b.version),
        ...(await fileBindings(db, c, b.files || [], "tasks", t.id)),
        audit(
          db,
          c.u,
          next === "done" ? "اعتماد إنجاز المهمة" : "تحديث مرحلة المهمة",
          "tasks",
          t.id,
          t.project_id,
        ),
        ...notifications(
          db,
          c.settings,
          recipient,
          next === "review"
            ? "مهمة جاهزة لمراجعتك"
            : next === "done"
              ? "اعتُمد إنجاز مهمتك"
              : next === "blocked"
                ? "مهمة تحتاج مساندتك"
                : "تحديث على المهمة",
          t.title,
          "tasks",
          t.id,
          t.project_id,
        ),
      ],
      { id: t.id },
      true,
    );
  }
  if (p === "/api/tasks/comment") {
    const t = await record(db, "tasks", b.id);
    c.need("tasks", "view", t);
    c.need("tasks", "edit", t);
    const body = string(b.body, 6000, true);
    if (!body && !(b.files || []).length) fail("اكتب رسالة أو أرفق ملفًا");
    const reply = b.reply_to
      ? await one(
          db,
          "SELECT * FROM nl_comments WHERE id=? AND task_id=?",
          b.reply_to,
          t.id,
        )
      : null;
    if (b.reply_to && !reply) fail("الرسالة التي ترد عليها غير متاحة");
    const mentions = [...new Set(b.mentions || [])].slice(0, 15),
      committee = c.committees.find((c) => c.id === parse(t.meta).committee_id);
    const audience = [
      ...new Set(
        [
          t.assignee_id,
          t.created_by,
          committee?.manager_id,
          reply?.created_by,
          ...mentions,
          ...(parse(t.meta).collaborators || []),
        ].filter((id) => id && id !== c.u.id),
      ),
    ];
    const recipients = [];
    for (const id of audience) {
      const m = await activeMember(db, id, true).catch(() => null);
      if (
        m &&
        permitted(
          withProjectAccess(withCommittees(m, c.committees), c.projectRows),
          "tasks",
          "view",
          t,
          c.bundles,
        )
      )
        recipients.push(id);
      else if (mentions.includes(id))
        fail("العضو المشار إليه لا يملك الوصول لهذه المهمة");
    }
    const id = uid();
    return commit(
      db,
      c,
      req,
      b,
      [
        db
          .prepare(
            "INSERT INTO nl_comments(id,task_id,body,created_by,created,meta) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            id,
            t.id,
            body,
            c.u.id,
            now(),
            JSON.stringify({
              reply_to: reply?.id || null,
              mentions,
              files: b.files || [],
            }),
          ),
        ...(await fileBindings(db, c, b.files || [], "tasks", t.id)),
        ...(b.files || []).map((fid) =>
          db
            .prepare("UPDATE nl_files SET meta=? WHERE id=?")
            .bind(JSON.stringify({ purpose: "comment", comment_id: id }), fid),
        ),
        audit(db, c.u, "رسالة في محادثة المهمة", "tasks", t.id, t.project_id),
        ...recipients.flatMap((member) =>
          notifications(
            db,
            c.settings,
            member,
            reply ? "رد جديد في المهمة" : "رسالة جديدة في المهمة",
            body || "مرفق جديد",
            "tasks",
            t.id,
            t.project_id,
          ),
        ),
      ],
      { id },
    );
  }
  if (p === "/api/tasks/checklist") {
    const t = await record(db, "tasks", b.id);
    c.need("tasks", "edit", t);
    const meta = parse(t.meta);
    if (t.status === "review") fail("أعد المهمة للتنفيذ قبل تعديل خطواتها");
    const item = meta.checklist?.find((x) => x.id === b.item_id);
    if (!item) fail("البند غير موجود");
    if (
      taskStatuses(c.settings, c.committees, t).find((s) => s.id === t.status)
        ?.done
    )
      fail("أعد فتح المهمة قبل تعديل قائمة التحقق");
    item.done = !!b.done;
    return commit(
      db,
      c,
      req,
      b,
      [
        db
          .prepare(
            "UPDATE nl_tasks SET meta=?,version=version+1,updated=? WHERE id=? AND version=?",
          )
          .bind(JSON.stringify(meta), now(), t.id, b.version),
        audit(db, c.u, "تحديث قائمة التحقق", "tasks", t.id, t.project_id),
      ],
      { id: t.id },
      true,
    );
  }
  if (p === "/api/suppliers/save") {
    const old = b.id ? await record(db, "suppliers", b.id) : null;
    c.need("suppliers", old ? "edit" : "create", old || {});
    const id = old?.id || uid();
    const phone = string(b.phone, 30, true).replace(/[\s-]/g, ""),
      email = string(b.email, 200, true).toLowerCase(),
      tax = string(b.tax_number, 30, true);
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone))
      fail("أدخل جوال المورد مع رمز الدولة");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("بريد المورد غير صالح");
    if (tax && !/^\d{15}$/.test(tax))
      fail("الرقم الضريبي السعودي يتكون من 15 رقمًا");
    if (
      tax &&
      (await one(
        db,
        "SELECT id FROM nl_suppliers WHERE tax_number=? AND id<>?",
        tax,
        id,
      ))
    )
      fail("يوجد مورد مسجل بهذا الرقم الضريبي");
    const iban = string(b.iban, 40, true).replace(/\s/g, "").toUpperCase();
    if (iban && !/^SA\d{22}$/.test(iban))
      fail("راجع الآيبان السعودي: SA ثم 22 رقمًا");
    const meta = {
      ...parse(old?.meta),
      site_location:
        b.site_location === undefined
          ? parse(old?.meta).site_location || null
          : validateLocation(b.site_location),
      entity_type: choice(b.entity_type || "business", [
        "business",
        "individual",
      ]),
      contact_name: string(b.contact_name, 120, true),
      city: string(b.city, 120, true),
      address: string(b.address, 500, true),
      registration: string(b.registration, 80, true),
      status: choice(b.supplier_status || "active", ["active", "suspended"]),
      bank_name: string(b.bank_name, 100, true),
      beneficiary: string(b.beneficiary, 160, true),
      iban,
    };
    if (b.media_profile !== undefined) {
      const mp = b.media_profile;
      if (
        !mp ||
        !Array.isArray(mp.accounts) ||
        !Array.isArray(mp.engagements) ||
        mp.accounts.length > 30 ||
        mp.engagements.length > 300
      )
        fail("راجع حسابات الملف ومشاركاته");
      const link = (v) => {
        if (!v) return "";
        let u;
        try {
          u = new URL(v);
        } catch {
          fail("رابط غير صالح");
        }
        if (!["http:", "https:"].includes(u.protocol))
          fail("استخدم رابط ويب صالحًا");
        return string(u.href, 1500, true);
      };
      const count = (v) => {
        if (v === "" || v == null) return null;
        const n = Number(v);
        if (!Number.isSafeInteger(n) || n < 0)
          fail("أدخل عددًا صحيحًا موجبًا أو اترك الحقل فارغًا");
        return n;
      };
      const day = (v) => (v ? validDate(v) : "");
      const hidden = (parse(old?.meta).media_profile?.engagements || []).filter(
        (e) => !canReadEngagement(c, e),
      );
      const engagements = [...hidden];
      const engagementIds = new Set(hidden.map((e) => e.id));
      const allowedFiles = new Set([
        ...(b.files || []),
        ...(
          await all(
            db,
            "SELECT id FROM nl_files WHERE entity_type='suppliers' AND entity_id=?",
            id,
          )
        ).map((f) => f.id),
      ]);
      for (const e of mp.engagements) {
        const engagementId = e.id ? string(e.id, 100) : uid();
        if (engagementIds.has(engagementId))
          fail("معرف مشاركة مكرر أو غير متاح", 409);
        engagementIds.add(engagementId);
        const pr = await record(db, "projects", e.project_id);
        c.need("projects", "view", pr);
        if (
          !Array.isArray(e.file_ids) ||
          e.file_ids.some((f) => !allowedFiles.has(f))
        )
          fail("مرفق العمل لا يتبع هذا الملف");
        engagements.push({
          id: engagementId,
          project_id: pr.id,
          date: day(e.date),
          title: string(e.title, 250),
          description: string(e.description, 5000, true),
          platform: string(e.platform, 80, true),
          url: link(e.url),
          status: choice(e.status, [
            "مخطط",
            "حضر",
            "قيد التنفيذ",
            "منشور",
            "موثق ومؤرشف",
            "ملغى",
          ]),
          followers: count(e.followers),
          views: count(e.views),
          interactions: count(e.interactions),
          notes: string(e.notes, 2000, true),
          file_ids: e.file_ids,
        });
      }
      meta.media_profile = {
        role: string(mp.role, 80),
        specialty: string(mp.specialty, 500, true),
        accounts: mp.accounts.map((a) => ({
          platform: string(a.platform, 80),
          handle: string(a.handle, 150, true),
          url: link(a.url),
          followers: count(a.followers),
          observed_on: day(a.observed_on),
        })),
        engagements,
      };
    }
    const vals = [
      string(b.name),
      string(b.phone, 30, true) || null,
      string(b.email, 200, true) || null,
      string(b.tax_number, 30, true) || null,
      string(b.category, 100, true),
      string(b.notes, 5000, true),
    ];
    const stmt = old
      ? db
          .prepare(
            "UPDATE nl_suppliers SET name=?,phone=?,email=?,tax_number=?,category=?,notes=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(...vals, id, b.version)
      : db
          .prepare(
            "INSERT INTO nl_suppliers(id,name,phone,email,tax_number,category,notes,created_by,created) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .bind(id, ...vals, c.u.id, now());
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        db
          .prepare(
            "UPDATE nl_suppliers SET meta=?,phone=?,email=?,tax_number=? WHERE id=?",
          )
          .bind(
            JSON.stringify(meta),
            phone || null,
            email || null,
            tax || null,
            id,
          ),
        ...(await fileBindings(db, c, b.files || [], "suppliers", id)),
        audit(
          db,
          c.u,
          meta.media_profile
            ? old
              ? "تحديث ملف إعلامي وأرشيف مشاركاته"
              : "إضافة ملف إعلامي"
            : old
              ? "تعديل مورد"
              : "إضافة مورد",
          "suppliers",
          id,
        ),
      ],
      { id },
      !!old,
    );
  }
  if (p === "/api/expenses/save") {
    const old = b.id ? await record(db, "expenses", b.id) : null;
    const project = await record(
      db,
      "projects",
      old?.project_id || b.project_id,
    );
    if (project.status === "closed") fail("المشروع مغلق");
    const ownCommittees = c.committees.filter(
      (x) =>
        x.project_id === project.id &&
        parse(x.members, []).some((m) => m.id === c.u.id),
    );
    const cid =
      b.committee_id ||
      parse(old?.meta).committee_id ||
      (ownCommittees.length === 1 ? ownCommittees[0].id : null);
    if (!cid) fail("حدد لجنة من اللجان المتاحة لك");
    const committee = await record(db, "committees", cid);
    if (committee.project_id !== project.id) fail("اللجنة لا تنتمي للمشروع");
    const candidate = old || {
      project_id: project.id,
      committee_id: cid,
      created_by: c.u.id,
    };
    c.need("expenses", old ? "edit" : "create", candidate);
    if (
      !c.can("users", "manage") &&
      committee.manager_id !== c.u.id &&
      !parse(committee.members, []).some((m) => m.id === c.u.id) &&
      !c.can("expenses", "approve", candidate) &&
      !c.can("expenses", "pay", candidate)
    )
      fail("يمكن رفع المصروف ضمن لجانك فقط", 403);
    if (
      old &&
      !["draft", "returned"].includes(old.status) &&
      !(
        old.status === "pending" &&
        !parse(old.meta).funding_source &&
        c.can("users", "manage")
      )
    )
      fail("يمكن تعديل المسودة أو الطلب المعاد فقط");
    if (
      old &&
      parse(old.meta).committee_id &&
      parse(old.meta).committee_id !== cid
    )
      fail("اللجنة المثبتة على الطلب لا تتغير");
    if (!fieldVisible(c.u, "expenses", "amount", candidate, c.bundles))
      fail("المبلغ غير متاح لك", 403);
    const line = committeeConfig(committee).budgetLines.find(
      (l) => l.id === b.budget_line_id && l.active !== false,
    );
    if (!line)
      fail(
        "اختر بند صرف مفعّلًا من بنود اللجنة؛ يجهزها الأدمن من إدارة اللجنة",
      );
    const claimant = b.claimant_id || parse(old?.meta).claimant_id || c.u.id;
    if (claimant !== c.u.id) c.need("users", "manage");
    await activeMember(db, claimant);
    if (b.task_id) {
      const t = await record(db, "tasks", b.task_id);
      c.need("tasks", "view", t);
      if (
        !c.can("users", "manage") &&
        committee.manager_id !== c.u.id &&
        !c.can("tasks", "assign", t) &&
        t.assignee_id !== c.u.id
      )
        fail("اربط المصروف بمهمة موكلة إليك فقط", 403);
      if (t.project_id !== project.id || parse(t.meta).committee_id !== cid)
        fail("المهمة يجب أن تكون من اللجنة نفسها");
    }
    if (b.supplier_id) {
      const sp = await record(db, "suppliers", b.supplier_id);
      c.need("suppliers", "view", sp);
      if (parse(sp.meta).status === "suspended") fail("المورد موقوف");
    }
    const source = choice(b.funding_source, [
      "personal",
      "advance",
      "direct",
      "unpaid",
    ]);
    let advance = null;
    if (source === "advance") {
      advance = await record(db, "advances", b.advance_id);
      c.need("advances", "view", advance);
      if (advance.project_id !== project.id || advance.assignee_id !== claimant)
        fail("اختر عهدة العضو نفسه في المشروع");
    }
    const amount = money(b.amount),
      tax = money(b.tax || 0, true);
    if (tax > amount) fail("الضريبة أكبر من الإجمالي");
    const status = choice(b.status || "pending", ["draft", "pending"]),
      id = old?.id || uid();
    const route = expenseRoute(committee, claimant, old?.created_by || c.u.id);
    if (status === "pending") {
      if (!route[0] || !route[1])
        fail(
          "يلزم تعيين المعتمدين، وبديل اعتماد إذا كان صاحب المصروف أو منشئه ضمن المسار",
        );
      if (route[0] === route[1])
        fail("الاعتمادان يحتاجان شخصين مختلفين: مدير اللجنة ثم المعتمد الثاني");
      for (const rid of route) {
        const u = withProjectAccess(
          withCommittees(await activeMember(db, rid), c.committees),
          c.projectRows,
        );
        if (
          !permitted(
            u,
            "expenses",
            "approve",
            { project_id: project.id, committee_id: cid },
            c.bundles,
          ) ||
          !permitted(
            u,
            "expenses",
            "view",
            { project_id: project.id, committee_id: cid },
            c.bundles,
          )
        )
          fail(
            "المسؤول في مسار الاعتماد لا يملك الوصول المطلوب؛ راجع إعداد العضوية",
          );
      }
      const proof = [
        ...(old
          ? await all(
              db,
              "SELECT * FROM nl_files WHERE entity_type='expenses' AND entity_id=?",
              id,
            )
          : []),
        ...(await Promise.all(
          (b.files || []).map((fid) =>
            one(db, "SELECT * FROM nl_files WHERE id=?", fid),
          ),
        )),
      ];
      if (
        !proof.some(
          (f) =>
            f &&
            ["invoice", "receipt"].includes(parse(f.meta).purpose) &&
            /^(application\/pdf|image\/)/.test(f.mime),
        )
      )
        fail("أرفق فاتورة أو إيصال دفع بصيغة PDF أو صورة قبل الإرسال");
      if (source === "direct") c.need("expenses", "pay", candidate);
    }
    const meta = {
      ...parse(old?.meta),
      committee_id: cid,
      task_id: b.task_id || null,
      budget_line_id: line.id,
      budget_line_name: line.name,
      claimant_id: claimant,
      collaborators: [claimant],
      funding_source: source,
      advance_id: advance?.id || null,
      payment_method: choice(b.payment_method || "transfer", [
        "transfer",
        "cash",
        "card",
        "other",
      ]),
      payment_reference: string(b.payment_reference, 200, true),
      notes: string(b.notes, 4000, true),
      route,
      approvalIndex: 0,
      approvals: [],
      settlement:
        source === "personal"
          ? "awaiting_approval"
          : source === "advance"
            ? "advance_pending"
            : source === "unpaid"
              ? "supplier_pending"
              : "direct_pending",
    };
    const vals = [
      project.id,
      b.supplier_id || null,
      string(b.title, 250),
      string(b.number, 120, true) || null,
      line.name,
      amount,
      tax,
      validDate(b.date),
      status,
      JSON.stringify(meta),
    ];
    const stmt = old
      ? db
          .prepare(
            "UPDATE nl_expenses SET project_id=?,supplier_id=?,title=?,number=?,category=?,amount=?,tax=?,date=?,status=?,meta=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(...vals, id, b.version)
      : db
          .prepare(
            "INSERT INTO nl_expenses(id,project_id,supplier_id,title,number,category,amount,tax,date,status,meta,created_by,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(id, ...vals, c.u.id, now());
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        ...(await fileBindings(db, c, b.files || [], "expenses", id)),
        audit(
          db,
          c.u,
          status === "pending" ? "رفع مصروف لمدير اللجنة" : "حفظ مسودة مصروف",
          "expenses",
          id,
          project.id,
        ),
        ...(status === "pending"
          ? notifications(
              db,
              c.settings,
              route[0],
              "مصروف ينتظر مراجعة مدير اللجنة",
              b.title,
              "expenses",
              id,
              project.id,
            )
          : []),
      ],
      { id },
      !!old,
    );
  }
  if (p === "/api/expenses/review") {
    const e = await record(db, "expenses", b.id);
    c.need("expenses", "approve", e);
    c.need("expenses", "view", e);
    if (!fieldVisible(c.u, "expenses", "amount", e, c.bundles))
      fail("لا يمكن الاعتماد دون مشاهدة المبلغ", 403);
    if (e.status !== "pending") fail("الطلب لا ينتظر اعتمادًا", 409);
    const meta = parse(e.meta),
      committee = await record(db, "committees", meta.committee_id),
      project = await record(db, "projects", e.project_id);
    const route = expenseRoute(committee, meta.claimant_id, e.created_by);
    if ([meta.claimant_id, e.created_by].includes(c.u.id))
      fail(
        "لا يمكن اعتماد مصروفك أو مصروف أنشأته؛ يراجعه البديل الذي حددته الإدارة",
        403,
      );
    if (!route[0] || !route[1] || route[0] === route[1])
      fail("راجع تعيين مدير اللجنة والمعتمد الثاني؛ يلزم شخصان مختلفان");
    let ix = meta.approvalIndex || 0;
    if (JSON.stringify(meta.route) !== JSON.stringify(route)) {
      meta.previousApprovals = [
        ...(meta.previousApprovals || []),
        ...(meta.approvals || []),
      ];
      meta.approvals = [];
      meta.route = route;
      ix = 0;
    }
    if (c.u.id !== route[ix])
      fail(
        ix === 0
          ? "الاعتماد الآن لدى مدير اللجنة"
          : "الاعتماد الآن لدى المعتمد الثاني",
        403,
      );
    const decision = choice(b.decision, ["approve", "return"]),
      approved = decision === "approve";
    const note = string(b.reason || b.note, 1500, approved),
      status = !approved ? "returned" : ix === 0 ? "pending" : "approved";
    meta.approvals = [
      ...(meta.approvals || []),
      {
        member_id: c.u.id,
        role: ix === 0 ? "manager" : "supervisor",
        decision,
        date: now(),
        reason: note,
      },
    ];
    meta.approvalIndex = approved ? ix + 1 : 0;
    const financial = [];
    if (status === "approved") {
      const paid = await one(
        db,
        "SELECT COALESCE(SUM(amount),0) AS total FROM nl_payments WHERE expense_id=?",
        e.id,
      );
      if (paid.total)
        fail("يوجد سداد سابق؛ يلزم مراجعة السجل قبل الاعتماد", 409);
      if (
        meta.funding_source === "advance" ||
        meta.funding_source === "direct"
      ) {
        const payment = uid();
        financial.push(
          db
            .prepare("INSERT INTO nl_payments VALUES(?,?,?,?,?,?,?)")
            .bind(
              payment,
              e.id,
              e.amount,
              e.date,
              meta.funding_source === "advance"
                ? "تصفية من العهدة بعد اعتمادين"
                : "دفع مباشر موثق",
              c.u.id,
              now(),
            ),
        );
        if (meta.funding_source === "advance") {
          const a = await record(db, "advances", meta.advance_id);
          if (
            a.project_id !== e.project_id ||
            a.assignee_id !== meta.claimant_id
          )
            fail("العهدة لا تطابق صاحب المصروف");
          financial.push(
            db
              .prepare(
                "INSERT INTO nl_advance_entries(id,advance_id,type,amount,date,payment_id,reference,created_by,created) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(CASE WHEN type='fund' THEN amount ELSE -amount END),0) FROM nl_advance_entries WHERE advance_id=?)>=?",
              )
              .bind(
                uid(),
                a.id,
                "settlement",
                e.amount,
                e.date,
                payment,
                "مصروف: " + e.title,
                c.u.id,
                now(),
                a.id,
                e.amount,
              ),
            db.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(uid()),
          );
          meta.settlement = "settled_from_advance";
        } else meta.settlement = "settled_direct";
      } else
        meta.settlement =
          meta.funding_source === "personal"
            ? "owed_to_member"
            : "owed_to_supplier";
    }
    const stmt = db
      .prepare(
        "UPDATE nl_expenses SET status=?,meta=?,version=version+1 WHERE id=? AND version=? AND status='pending'",
      )
      .bind(status, JSON.stringify(meta), e.id, b.version);
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        ...financial,
        audit(
          db,
          c.u,
          approved
            ? ix === 0
              ? "اعتماد مدير اللجنة"
              : "اعتماد المعتمد الثاني"
            : "إعادة المصروف للاستكمال",
          "expenses",
          e.id,
          e.project_id,
        ),
        ...notifications(
          db,
          c.settings,
          status === "pending" ? route[1] : meta.claimant_id || e.created_by,
          status === "pending"
            ? "مصروف ينتظر اعتمادك النهائي"
            : status === "returned"
              ? "أُعيد المصروف للاستكمال"
              : meta.funding_source === "advance"
                ? "اعتُمد المصروف وخُصم من عهدتك"
                : "اعتُمد المصروف",
          e.title,
          "expenses",
          e.id,
          e.project_id,
        ),
      ],
      { id: e.id, status },
      true,
    );
  }
  if (p === "/api/expenses/pay") {
    const e = await record(db, "expenses", b.id);
    c.need("expenses", "pay", e);
    c.need("expenses", "view", e);
    if (e.status !== "approved") fail("يلزم اكتمال الاعتمادين قبل السداد");
    if (!fieldVisible(c.u, "expenses", "amount", e, c.bundles))
      fail("المبلغ محجوب", 403);
    const meta = parse(e.meta);
    if (["advance", "direct"].includes(meta.funding_source))
      fail("هذا المصروف صُفّي تلقائيًا عند الاعتماد النهائي");
    const files = await Promise.all(
      (b.files || []).map((id) =>
        one(db, "SELECT * FROM nl_files WHERE id=?", id),
      ),
    );
    if (
      !files.some(
        (f) =>
          f &&
          f.created_by === c.u.id &&
          f.entity_type === "draft" &&
          parse(f.meta).purpose === "reimbursement" &&
          /^(application\/pdf|image\/)/.test(f.mime),
      )
    )
      fail("أرفق إيصال السداد الفعلي قبل إثبات تسوية المستحق");
    const amount = money(b.amount),
      id = uid(),
      reference = string(b.reference, 200),
      date = validDate(b.date);
    const stmt = db
      .prepare(
        "INSERT INTO nl_payments SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM nl_expenses WHERE id=? AND status='approved' AND amount-(SELECT COALESCE(SUM(amount),0) FROM nl_payments WHERE expense_id=?)>=?)",
      )
      .bind(
        id,
        e.id,
        amount,
        date,
        reference,
        c.u.id,
        now(),
        e.id,
        e.id,
        amount,
      );
    const bindings = await fileBindings(db, c, b.files || [], "expenses", e.id);
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        ...bindings,
        ...(b.files || []).map((fid) =>
          db
            .prepare("UPDATE nl_files SET meta=? WHERE id=?")
            .bind(
              JSON.stringify({ purpose: "reimbursement", payment_id: id }),
              fid,
            ),
        ),
        audit(
          db,
          c.u,
          "إثبات سداد مستحق وإرفاق الإيصال",
          "expenses",
          e.id,
          e.project_id,
        ),
        ...notifications(
          db,
          c.settings,
          meta.claimant_id || e.created_by,
          "تم سداد مستحقك؛ إيصال التحويل مرفق",
          e.title,
          "expenses",
          e.id,
          e.project_id,
        ),
      ],
      { id },
      true,
    );
  }
  if (p === "/api/assets/save") {
    const old = b.id ? await record(db, "assets", b.id) : null;
    c.need("assets", old ? "edit" : "create", old || {});
    const retryKey = req.headers.get("idempotency-key");
    if (retryKey) {
      const prior = await one(
        db,
        "SELECT * FROM nl_receipts WHERE id=?",
        retryKey,
      );
      if (prior) {
        if (
          prior.actor !== c.u.id ||
          prior.hash !== (await digest(req.url + "|" + JSON.stringify(b)))
        )
          fail("معرف الطلب مستخدم لعملية مختلفة", 409);
        return json(parse(prior.result));
      }
    }
    const id = old?.id || uid(),
      kind = choice(b.kind || "quantity", [
        "quantity",
        "serialized",
        "consumable",
      ]);
    const quantity = Number(b.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000 ||
      (kind === "serialized" && quantity !== 1)
    )
      fail("راجع كمية الأصل");
    if (old) {
      const ms = await all(
        db,
        "SELECT * FROM nl_movements WHERE asset_id=?",
        id,
      );
      const used = ms.reduce(
        (s, m) =>
          s +
          (m.type === "issue" || m.type === "consume"
            ? m.quantity
            : m.type === "return"
              ? -m.quantity
              : 0),
        0,
      );
      if (quantity < used) fail("الكمية أقل من المصروف والمسلم");
      if (old.kind !== kind && ms.length)
        fail("لا يمكن تغيير نوع التتبع بعد تسجيل حركات");
    }
    const count = b.count === undefined ? 1 : Number(b.count);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > ASSET_BATCH_LIMIT ||
      (count > 1 && (old || kind !== "serialized"))
    )
      fail("إضافة عدة قطع متاحة للأصول الفردية الجديدة فقط، حتى 50 قطعة");
    if (count > 1 && b.manufacturer_serial)
      fail("أضف رقم الشركة المصنعة لكل قطعة من سجلها بعد إنشاء المجموعة");
    if (old && b.serial !== undefined && b.serial !== old.serial)
      fail("رقم الأصل ثابت ولا يتغير بعد تسجيله");
    const ids = old
      ? [id]
      : [id, ...Array.from({ length: count - 1 }, () => uid())];
    const batchId = old
      ? parse(old.meta).batch_id || null
      : count > 1
        ? uid()
        : null;
    const meta = {
      batch_id: batchId,
      category_detail: string(b.category_detail, 200, true),
      site_location:
        b.site_location === undefined
          ? parse(old?.meta).site_location || null
          : validateLocation(b.site_location),
      manufacturer_serial: string(b.manufacturer_serial, 150, true),
      brand: string(b.brand, 150, true),
      warranty_end: validDate(b.warranty_end, true),
      notes: string(b.notes, 4000, true),
      rental_start: validDate(b.rental_start, true),
      rental_end: validDate(b.rental_end, true),
      unit_value: money(b.unit_value || 0, true),
      rental_total: money(b.rental_total || 0, true),
      deposit: money(b.deposit || 0, true),
      supplier_id: b.supplier_id || null,
      project_id: b.project_id || null,
      model: string(b.model, 150, true),
      dimensions: string(b.dimensions, 150, true),
      storage_location: string(b.storage_location, 200, true),
      acquired: validDate(b.acquired, true),
    };
    if (meta.supplier_id)
      c.need(
        "suppliers",
        "view",
        await record(db, "suppliers", meta.supplier_id),
      );
    if (meta.project_id)
      c.need("projects", "view", await record(db, "projects", meta.project_id));
    if (
      b.ownership === "rented" &&
      (!meta.rental_start || !meta.rental_end || !meta.supplier_id)
    )
      fail("حدد المورد وبداية الإيجار ونهايته للأصل المستأجر");
    if (
      meta.rental_start &&
      meta.rental_end &&
      meta.rental_end < meta.rental_start
    )
      fail("نهاية الإيجار تسبق بدايته");
    const vals = [
      string(b.name),
      kind,
      choice(b.ownership || "owned", ["owned", "rented", "borrowed"]),
      string(b.category, 100, true),
      quantity,
      string(b.location, 200, true),
      old?.serial || null,
      choice(b.condition || "ready", ["ready", "maintenance", "damaged"]),
      JSON.stringify(meta),
    ];
    const bindings = await fileBindings(db, c, b.files || [], "assets", id);
    const stmts = old
      ? [
          db
            .prepare(
              "UPDATE nl_assets SET name=?,kind=?,ownership=?,category=?,quantity=?,location=?,serial=?,condition=?,meta=?,version=version+1 WHERE id=? AND version=? AND ? >= (SELECT COALESCE(SUM(CASE WHEN type IN ('issue','consume') THEN quantity WHEN type='return' THEN -quantity ELSE 0 END),0) FROM nl_movements WHERE asset_id=?)",
            )
            .bind(...vals, id, b.version, quantity, id),
        ]
      : [
          db
            .prepare(
              "INSERT INTO nl_asset_numbers(asset_id) SELECT value FROM json_each(?)",
            )
            .bind(JSON.stringify(ids)),
          db
            .prepare(
              "INSERT INTO nl_assets(id,name,kind,ownership,category,quantity,location,serial,condition,meta,created_by,created) SELECT j.value,?,?,?,?,?,?,(SELECT 'NL-' || printf('%08d',number) FROM nl_asset_numbers WHERE asset_id=j.value),?,?,?,? FROM json_each(?) j",
            )
            .bind(
              ...vals.slice(0, 6),
              ...vals.slice(7),
              c.u.id,
              now(),
              JSON.stringify(ids),
            ),
        ];
    stmts.push(...bindings);
    if (count > 1 && (b.files || []).length) {
      // Common photos/docs get separate authorized file records; the private blob stays shared.
      stmts.push(
        db
          .prepare(
            "INSERT INTO nl_files(id,entity_type,entity_id,meta,name,mime,size,object_key,created_by,created) SELECT lower(hex(randomblob(16))),'assets',j.value,f.meta,f.name,f.mime,f.size,f.object_key,f.created_by,f.created FROM nl_files f CROSS JOIN json_each(?) j WHERE f.id IN (SELECT value FROM json_each(?)) AND f.entity_type='assets' AND f.entity_id=? AND f.created_by=?",
          )
          .bind(
            JSON.stringify(ids.slice(1)),
            JSON.stringify(b.files),
            id,
            c.u.id,
          ),
      );
    }
    stmts.push(
      db
        .prepare(
          "INSERT INTO nl_audit(id,actor,action,resource,entity_id,project_id,detail,created) SELECT lower(hex(randomblob(16))),?,?,'assets',value,NULL,'',? FROM json_each(?)",
        )
        .bind(
          c.u.id,
          old ? "تعديل أصل" : "إضافة أصل برقم دائم",
          now(),
          JSON.stringify(ids),
        ),
    );
    return commit(db, c, req, b, stmts, { id, ids, count }, !!old);
  }

  if (p === "/api/assets/move") {
    const a = await record(db, "assets", b.id);
    c.need("assets", "assign", a);
    const type = choice(b.type, ["issue", "return", "consume"]),
      qty = Number(b.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000000)
      fail("أدخل كمية صحيحة");
    if (a.kind === "consumable" && type !== "consume")
      fail("استخدم تسجيل الاستهلاك للمواد الاستهلاكية");
    if (type === "consume" && a.kind !== "consumable")
      fail("هذا الأصل غير استهلاكي");
    if (type !== "return" && a.condition !== "ready")
      fail("الأصل غير جاهز للتسليم");
    const member = await activeMember(db, b.member_id);
    if (b.project_id) {
      const pr = await record(db, "projects", b.project_id);
      c.need("projects", "view", pr);
    }
    const id = uid();
    const availableSQL =
      type === "return"
        ? "(SELECT COALESCE(SUM(CASE WHEN type='issue' THEN quantity WHEN type='return' THEN -quantity ELSE 0 END),0) FROM nl_movements WHERE asset_id=? AND member_id=?)>=?"
        : "(SELECT quantity FROM nl_assets WHERE id=?)-(SELECT COALESCE(SUM(CASE WHEN type IN ('issue','consume') THEN quantity WHEN type='return' THEN -quantity ELSE 0 END),0) FROM nl_movements WHERE asset_id=?)>=?";
    const args = type === "return" ? [a.id, member.id, qty] : [a.id, a.id, qty];
    return commit(
      db,
      c,
      req,
      b,
      [
        db
          .prepare(
            "INSERT INTO nl_movements(id,asset_id,project_id,member_id,type,quantity,notes,created_by,created) SELECT ?,?,?,?,?,?,?,?,? WHERE " +
              availableSQL,
          )
          .bind(
            id,
            a.id,
            b.project_id || null,
            member.id,
            type,
            qty,
            string(b.notes, 1000, true),
            c.u.id,
            now(),
            ...args,
          ),
        db.prepare("UPDATE nl_movements SET meta=? WHERE id=?").bind(
          JSON.stringify({
            reference: string(b.reference, 200, true),
            due: validDate(b.return_due, true),
            condition: choice(b.handover_condition || "good", [
              "good",
              "wear",
              "damaged",
            ]),
            accessories: string(b.accessories, 1000, true),
          }),
          id,
        ),
        ...(await fileBindings(db, c, b.files || [], "assets", a.id)),
        audit(
          db,
          c.u,
          type === "return"
            ? "إرجاع أصل"
            : type === "consume"
              ? "صرف مواد"
              : "تسليم عهدة",
          "assets",
          a.id,
          b.project_id,
        ),
      ],
      { id },
      true,
    );
  }
  if (p === "/api/users/access-preview") {
    c.need("users", "manage");
    const grants = validateGrants(b.grants || []),
      id = b.id || "access-preview-member";
    if (!Array.isArray(b.memberships) || b.memberships.length > 40)
      fail("راجع عضويات اللجان");
    const memberships = b.memberships.map((link) => {
      const committee = c.committees.find((x) => x.id === link.committee_id);
      if (!committee) fail("اختر لجنة لكل عضوية أو احذف السطر الفارغ.");
      c.need("committees", "edit", committee);
      const was = parse(committee.members, []).find((m) => m.id === id);
      return {
        ...committee,
        manager_id: link.role === "manager" ? id : null,
        members: [
          {
            id,
            role: choice(link.role, ["member", "manager", "supervisor"]),
            grants:
              was?.role === link.role ? was.grants : MEMBER_PRESETS[link.role],
          },
        ],
      };
    });
    const u = withCommittees(
        { id, status: "active", grants, bundles: b.bundles || [] },
        memberships,
      ),
      access = [];
    const scopes = [
      { name: "كل المنصة", record: null },
      ...c.projectRows
        .filter((p) => c.can("projects", "view", p))
        .map((p) => ({
          name: p.title,
          record: { id: p.id, project_id: p.id },
        })),
      ...c.committees
        .filter((k) => c.can("committees", "view", k))
        .map((k) => ({
          name: k.name,
          record: { id: k.id, project_id: k.project_id, committee_id: k.id },
        })),
    ];
    for (const [resource, actions] of Object.entries(RESOURCE_ACTIONS)) {
      const global = actions.filter((action) =>
        permitted(u, resource, action, null, c.bundles),
      );
      if (global.includes("view"))
        access.push({
          name: RESOURCES[resource],
          scope: "كل المنصة",
          actions: global.map((a) => ACTION_NAMES[a]),
        });
      for (const scope of scopes.slice(1)) {
        const allowed = actions.filter((action) =>
          permitted(u, resource, action, scope.record, c.bundles),
        );
        const own = actions.filter((action) =>
          permitted(
            u,
            resource,
            action,
            { ...scope.record, created_by: id, assignee_id: id },
            c.bundles,
          ),
        );
        if (
          allowed.includes("view") &&
          allowed.some((a) => !global.includes(a))
        )
          access.push({
            name: RESOURCES[resource],
            scope: scope.name,
            actions: allowed
              .filter((a) => !global.includes(a))
              .map((a) => ACTION_NAMES[a]),
          });
        if (
          own.includes("view") &&
          own.some((a) => !allowed.includes(a) && !global.includes(a))
        )
          access.push({
            name: RESOURCES[resource],
            scope: scope.name + " · سجلاته",
            actions: own
              .filter((a) => !allowed.includes(a) && !global.includes(a))
              .map((a) => ACTION_NAMES[a]),
          });
      }
      const personal = actions.filter((action) =>
        permitted(
          u,
          resource,
          action,
          { created_by: id, assignee_id: id },
          c.bundles,
        ),
      );
      if (
        personal.includes("view") &&
        !global.includes("view") &&
        personal.some((a) => !global.includes(a))
      )
        access.push({
          name: RESOURCES[resource],
          scope: "سجلاته الشخصية",
          actions: personal
            .filter((a) => !global.includes(a))
            .map((a) => ACTION_NAMES[a]),
        });
    }
    return json({
      access,
      committees: memberships.map((k) => ({
        name: k.name,
        role: {
          member: "عضو",
          manager: "مدير اللجنة",
          supervisor: "مشرف متابعة",
        }[k.members[0].role],
      })),
      restrictions: effectiveGrants(u, c.bundles)
        .filter(
          (g) =>
            g.effect === "deny" &&
            (!g.expires || Date.parse(g.expires) > Date.now()),
        )
        .map(
          (g) =>
            (RESOURCES[g.resource] || "جميع الأقسام") +
            " · " +
            (ACTION_NAMES[g.action] || "جميع الإجراءات"),
        ),
    });
  }
  if (p === "/api/users/save") {
    c.need("users", "manage");
    const old = b.id ? await record(db, "users", b.id) : null;
    const id = old?.id || uid();
    const grants = validateGrants(b.grants || []);
    for (const g of grants) ensureGrantAccess(c, g);
    const bundleIds = Array.isArray(b.bundles) ? b.bundles : [];
    for (const bid of bundleIds) {
      const group = c.bundles.find((x) => x.id === bid);
      if (!group) fail("مجموعة صلاحيات غير متاحة");
      for (const g of parse(group.grants, [])) ensureGrantAccess(c, g);
    }
    const status = choice(b.status || "pending", [
      "pending",
      "active",
      "suspended",
      "invited",
    ]);
    if (
      id === c.u.id &&
      (status !== "active" ||
        !permitted(
          {
            ...c.u,
            grants: JSON.stringify(grants),
            bundles: JSON.stringify(bundleIds),
          },
          "users",
          "manage",
          null,
          c.bundles,
        ))
    )
      fail("حافظ على صلاحيتك الإدارية قبل تعديل حسابك");
    const membershipStatements = [];
    if (b.memberships !== undefined) {
      if (
        !Array.isArray(b.memberships) ||
        b.memberships.length > 40 ||
        new Set(b.memberships.map((x) => x.committee_id)).size !==
          b.memberships.length
      )
        fail("راجع عضويات اللجان");
      for (const link of b.memberships) {
        if (!c.committees.some((x) => x.id === link.committee_id))
          fail("اللجنة غير متاحة");
        choice(link.role, ["member", "manager", "supervisor"]);
        for (const grant of MEMBER_PRESETS[link.role])
          ensureGrantAccess(c, {
            ...grant,
            scope: "committee",
            committeeId: link.committee_id,
          });
      }
      for (const committee of c.committees) {
        const previous = parse(committee.members, []),
          link = b.memberships.find((x) => x.committee_id === committee.id),
          was = previous.find((x) => x.id === id);
        if (!link && !was) continue;
        c.need("committees", "edit", committee);
        if (link && status !== "active" && link.role === "manager")
          fail("فعّل الحساب قبل تعيينه مديرًا للجنة");
        const members = previous.filter((x) => x.id !== id);
        if (link)
          members.push({
            id,
            role: link.role,
            grants:
              was?.role === link.role ? was.grants : MEMBER_PRESETS[link.role],
          });
        const manager =
          link?.role === "manager"
            ? id
            : committee.manager_id === id
              ? null
              : committee.manager_id;
        if (
          link?.role === "manager" &&
          committee.manager_id &&
          committee.manager_id !== id
        ) {
          const former = members.find((x) => x.id === committee.manager_id);
          if (former) {
            former.role = "member";
            former.grants = MEMBER_PRESETS.member;
          }
        }
        membershipStatements.push(
          db
            .prepare(
              "UPDATE nl_committees SET members=?,manager_id=?,version=version+1 WHERE id=? AND version=?",
            )
            .bind(
              JSON.stringify(members),
              manager,
              committee.id,
              committee.version,
            ),
          db.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(uid()),
        );
      }
    }
    const phone = b.phone ? String(b.phone).replace(/[\s-]/g, "") : null;
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone))
      fail("أدخل الجوال مع رمز الدولة مثل +9665XXXXXXXX");
    const email = b.email ? string(b.email, 200).toLowerCase() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("البريد الإلكتروني غير صالح");
    const vals = [
      string(b.name),
      email,
      phone,
      status,
      JSON.stringify(grants),
      JSON.stringify(bundleIds),
      string(b.team, 120, true),
    ];
    const stmt = old
      ? db
          .prepare(
            "UPDATE nl_members SET name=?,email=?,phone=?,status=?,grants=?,bundles=?,team=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(...vals, id, b.version)
      : db
          .prepare(
            "INSERT INTO nl_members(id,name,email,phone,status,grants,bundles,team,created) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .bind(id, ...vals, now());
    return commit(
      db,
      c,
      req,
      b,
      [
        stmt,
        ...membershipStatements,
        ...(old && phone !== old.phone
          ? [
              db
                .prepare("UPDATE nl_members SET verified=0 WHERE id=?")
                .bind(id),
              db
                .prepare("DELETE FROM nl_contact_preferences WHERE member_id=?")
                .bind(id),
            ]
          : []),
        audit(db, c.u, old ? "تحديث وصول عضو" : "إضافة عضو", "users", id),
      ],
      { id },
      !!old,
    );
  }
  if (p === "/api/bundles/save") {
    c.need("users", "manage");
    const grants = validateGrants(b.grants || []);
    for (const g of grants) ensureGrantAccess(c, g);
    const id = b.id || uid(),
      old = c.bundles.find((x) => x.id === id);
    if (
      old &&
      !permitted(
        c.u,
        "users",
        "manage",
        null,
        c.bundles.map((x) => (x.id === id ? { ...x, grants } : x)),
      )
    )
      fail("لا يمكن تعديل الحزمة بما يلغي وصولك الإداري");
    const stmt = old
      ? db
          .prepare(
            "UPDATE nl_bundles SET name=?,grants=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(string(b.name), JSON.stringify(grants), id, b.version)
      : db
          .prepare("INSERT INTO nl_bundles(id,name,grants) VALUES(?,?,?)")
          .bind(id, string(b.name), JSON.stringify(grants));
    return commit(
      db,
      c,
      req,
      b,
      [stmt, audit(db, c.u, "حفظ مجموعة صلاحيات", "users", id)],
      { id },
      !!old,
    );
  }
  if (p === "/api/settings/save") {
    c.need("settings", "manage");
    const s = { ...c.settings, ...b.settings };
    s.sanad = validateSanadConfig(s.sanad);
    s.name = string(s.name, 100);
    s.description = string(s.description, 500, true);
    if (
      !Array.isArray(s.priorities) ||
      !s.priorities.length ||
      s.priorities.length > 10
    )
      fail("راجع الأولويات");
    s.priorities = s.priorities.map((x) => ({
      id: string(x.id, 60),
      name: string(x.name, 60),
    }));
    if (!Array.isArray(s.approval?.route) || s.approval.route.length > 10)
      fail("راجع مسار الاعتماد");
    if (new Set(s.approval.route).size !== s.approval.route.length)
      fail("لا تكرر العضو في مسار الاعتماد");
    if (
      !Array.isArray(s.taskStatuses) ||
      s.taskStatuses.length < 2 ||
      s.taskStatuses.length > 12
    )
      fail("أضف من حالتين إلى 12 حالة");
    const ids = new Set();
    for (const x of s.taskStatuses) {
      string(x.name, 60);
      string(x.id, 60);
      if (ids.has(x.id)) fail("معرف حالة مكرر");
      ids.add(x.id);
      if (!/^#[0-9a-f]{6}$/i.test(x.color)) fail("لون الحالة غير صالح");
    }
    if (!s.taskStatuses.some((x) => x.done) || s.taskStatuses[0].done)
      fail("حدد حالة مكتملة واحدة على الأقل، واجعل أول حالة غير مكتملة");
    for (const old of c.settings.taskStatuses.filter((x) => !ids.has(x.id))) {
      const used = await one(
        db,
        "SELECT id FROM nl_tasks WHERE status=? AND json_extract(meta,'$.committee_id') IS NULL LIMIT 1",
        old.id,
      );
      if (used) fail("انقل المهام من الحالة «" + old.name + "» قبل حذفها");
    }
    if (
      !Array.isArray(s.categories) ||
      !s.categories.length ||
      s.categories.length > 50
    )
      fail("راجع تصنيفات المصروفات");
    s.categories = s.categories.map((x) => string(x, 80));
    s.customFields = (s.customFields || []).slice(0, 20).map((x) => ({
      id: string(x.id, 60),
      name: string(x.name, 80),
      type: choice(x.type, ["text", "number", "date", "select"]),
      required: !!x.required,
      options: (x.options || []).slice(0, 30).map((v) => string(v, 80)),
    }));
    if (new Set(s.customFields.map((x) => x.id)).size !== s.customFields.length)
      fail("حقل مخصص مكرر");
    s.guideTemplate = {
      name: string(s.guideTemplate.name, 100),
      version:
        c.settings.guideTemplate.version +
        (JSON.stringify(s.guideTemplate) !==
        JSON.stringify(c.settings.guideTemplate)
          ? 1
          : 0),
      approved: !!s.guideTemplate.approved,
      sections: s.guideTemplate.sections
        .map((x) => string(x, 150))
        .slice(0, 15),
    };
    if (!s.guideTemplate.sections.length)
      fail("أضف قسمًا واحدًا على الأقل للقالب");
    for (const id of s.approval.route || []) await activeMember(db, id);
    s.taskTemplates = (s.taskTemplates || []).slice(0, 30);
    const stmt = c.settingsVersion
      ? db
          .prepare(
            "UPDATE nl_settings SET value=?,version=version+1 WHERE key='workspace' AND version=?",
          )
          .bind(JSON.stringify(s), b.version)
      : db
          .prepare(
            "INSERT INTO nl_settings(key,value,version) VALUES('workspace',?,1)",
          )
          .bind(JSON.stringify(s));
    return commit(
      db,
      c,
      req,
      b,
      [stmt, audit(db, c.u, "تحديث إعدادات الديوان", "settings", "workspace")],
      { ok: true },
      !!c.settingsVersion,
    );
  }
  if (p === "/api/guides/save") {
    const project = await record(db, "projects", b.project_id);
    c.need("assistant", "create", {
      project_id: project.id,
      created_by: c.u.id,
    });
    const old = b.id
      ? await one(db, "SELECT * FROM nl_guides WHERE id=?", b.id)
      : null;
    if (old && old.created_by !== c.u.id && !c.can("documents", "edit", old))
      fail("الدليل غير متاح للتعديل", 403);
    const task = b.task_id ? await record(db, "tasks", b.task_id) : null;
    if (task) {
      c.need("tasks", "edit", task);
      if (task.project_id !== project.id) fail("المهمة من مشروع آخر");
    }
    const id = old?.id || uid(),
      content = {
        sections: (b.content.sections || []).slice(0, 20).map((x) => ({
          title: string(x.title, 150),
          body: string(x.body, 10000, true),
        })),
        assignee_id: b.content.assignee_id || null,
        due: validDate(b.content.due, true),
        priority: b.content.priority || "normal",
      };
    const stmt = old
      ? db
          .prepare(
            "UPDATE nl_guides SET title=?,content=?,task_id=?,template_version=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(
            string(b.title),
            JSON.stringify(content),
            task?.id || null,
            c.settings.guideTemplate.version,
            id,
            b.version,
          )
      : db
          .prepare(
            "INSERT INTO nl_guides(id,project_id,task_id,title,content,template_version,created_by,created) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            project.id,
            task?.id || null,
            string(b.title),
            JSON.stringify(content),
            c.settings.guideTemplate.version,
            c.u.id,
            now(),
          );
    return commit(
      db,
      c,
      req,
      b,
      [stmt, audit(db, c.u, "حفظ مسودة دليل", "documents", id, project.id)],
      { id, version: old ? old.version + 1 : 1 },
      !!old,
    );
  }
  if (p === "/api/notifications/read") {
    await db
      .prepare(
        "UPDATE nl_notifications SET status='read' WHERE member_id=? AND channel='in_app'",
      )
      .bind(c.u.id)
      .run();
    return json({ ok: true });
  }
  if (p === "/api/agent/history/clear") {
    c.need("assistant", "view");
    await db
      .prepare("DELETE FROM nl_agent_turns WHERE member_id=?")
      .bind(c.u.id)
      .run();
    return json({ cleared: true });
  }
  if (p === "/api/agent/ask") {
    c.need("assistant", "view");
    return json(
      await askSanad(env, c, b, await state(db, c), async () => {
        const fresh = await context(req, env);
        fresh.need("assistant", "view");
        return accessTag(fresh, await state(db, fresh));
      }),
    );
  }
  if (p === "/api/extract") {
    c.need("assistant", "view");
    const file = await one(
      db,
      "SELECT * FROM nl_files WHERE id=?",
      string(b.file_id),
    );
    if (!file) fail("المرفق غير متاح", 404);
    await assertFileRead(db, c, file);
    const meta = parse(file.meta);
    if (!["invoice", "receipt"].includes(meta.purpose))
      fail("اختر فاتورة أو إيصال دفع");
    if (
      !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
        file.mime,
      )
    )
      fail("صيغة غير مدعومة للتحليل");
    const object = await env.BUCKET.get(file.object_key);
    if (!object) fail("الملف غير متاح", 404);
    const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
    let base = "";
    for (let i = 0; i < bytes.length; i += 8192)
      base += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const data = "data:" + file.mime + ";base64," + btoa(base);
    return json(
      await extractInvoice(
        env,
        c,
        file,
        file.mime === "application/pdf"
          ? { type: "input_file", filename: file.name, file_data: data }
          : { type: "input_image", image_url: data },
      ),
    );
  }
  if (p === "/api/integrations/dispatch") {
    c.need("settings", "manage");
    return json(await dispatchNotifications(env));
  }
  if (p === "/api/maintenance/run") {
    c.need("settings", "manage");
    return json({
      maintenance: await maintain(env),
      delivery: await dispatchNotifications(env),
    });
  }
  if (p === "/api/contact/preferences") {
    await db
      .prepare(
        "INSERT INTO nl_contact_preferences(member_id,whatsapp,consent_at) VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET whatsapp=excluded.whatsapp,consent_at=excluded.consent_at",
      )
      .bind(c.u.id, b.whatsapp === true ? 1 : 0, now())
      .run();
    return json({ ok: true });
  }
  if (p === "/api/projects/clone") {
    const original = await record(db, "projects", b.id);
    c.need("projects", "view", original);
    c.need("projects", "create");
    const newId = uid(),
      start = validDate(b.start),
      due = validDate(b.due);
    if (due < start) fail("تاريخ النهاية يسبق البداية");
    const stmts = [
      db
        .prepare(
          "INSERT INTO nl_projects(id,title,description,season,status,start,due,budget,meta,created_by,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          newId,
          string(b.title),
          original.description,
          string(b.season, 100, true),
          "planned",
          start,
          due,
          0,
          JSON.stringify({ ...parse(original.meta), supervisor_id: null }),
          c.u.id,
          now(),
        ),
    ];
    for (const committee of c.committees.filter(
      (x) => x.project_id === original.id,
    )) {
      c.need("committees", "view", committee);
      const config = committeeConfig(committee);
      config.second_approver_id = null;
      config.review_delegate_id = null;
      config.budgetLines = config.budgetLines.map((l) => ({ ...l, budget: 0 }));
      stmts.push(
        db
          .prepare(
            "INSERT INTO nl_committees(id,project_id,name,description,manager_id,members,statuses,created_by,created,config) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            uid(),
            newId,
            committee.name,
            committee.description,
            null,
            "[]",
            JSON.stringify(TASK_FLOW),
            c.u.id,
            now(),
            JSON.stringify(config),
          ),
      );
    }
    stmts.push(
      audit(db, c.u, "إنشاء مشروع من قالب سابق", "projects", newId, newId),
    );
    return commit(db, c, req, b, stmts, { id: newId });
  }
  fail("المسار غير موجود", 404);
}
export async function dispatchNotifications(env) {
  if (!integrationStatus(env).whatsapp) return { accepted: 0, ready: false };
  const db = env.DB,
    list = await all(
      db,
      `SELECT n.*,j.status AS delivery_status,j.attempts,j.next_at FROM nl_notifications n LEFT JOIN nl_delivery_jobs j ON j.id=n.id WHERE n.channel='whatsapp' AND ((j.id IS NULL AND n.created>?) OR (j.status='retry' AND j.next_at<? AND j.attempts<4)) ORDER BY n.created LIMIT 20`,
      new Date(Date.now() - 86400000).toISOString(),
      Date.now(),
    );
  const committees = await all(db, "SELECT * FROM nl_committees"),
    bundles = await all(db, "SELECT * FROM nl_bundles");
  let accepted = 0;
  for (const n of list) {
    const m = await one(db, "SELECT * FROM nl_members WHERE id=?", n.member_id),
      pref = await one(
        db,
        "SELECT * FROM nl_contact_preferences WHERE member_id=?",
        n.member_id,
      );
    let entity;
    try {
      entity = await record(db, n.resource, n.entity_id);
    } catch {
      entity = null;
    }
    if (
      !m ||
      m.status !== "active" ||
      !m.verified ||
      !m.phone ||
      !pref?.whatsapp ||
      !entity ||
      !permitted(
        withCommittees(m, committees),
        n.resource,
        "view",
        entity,
        bundles,
      )
    ) {
      await db
        .prepare(
          "INSERT INTO nl_delivery_jobs(id,status,updated) VALUES(?,'not_eligible',?) ON CONFLICT(id) DO UPDATE SET status='not_eligible',updated=excluded.updated WHERE status='retry'",
        )
        .bind(n.id, now())
        .run();
      continue;
    }
    const claim = await db
      .prepare(
        "INSERT INTO nl_delivery_jobs(id,status,attempts,updated) VALUES(?,'sending',1,?) ON CONFLICT(id) DO UPDATE SET status='sending',attempts=attempts+1,updated=excluded.updated WHERE status='retry' AND next_at<? AND attempts<4 RETURNING id",
      )
      .bind(n.id, now(), Date.now())
      .first();
    if (!claim) continue;
    try {
      const base = httpsOrigin(env.APP_BASE_URL);
      if (!base) throw new Error("base_url_missing");
      // Only minimal metadata leaves the platform; the link rechecks access on open.
      const deep =
        base.replace(/\/$/, "") +
        "/#" +
        n.resource +
        "?record=" +
        encodeURIComponent(n.entity_id);
      const id = await whatsapp(
        env,
        m.phone,
        env.WHATSAPP_NOTIFICATION_TEMPLATE,
        [m.name, n.title, deep],
      );
      await db.batch([
        db
          .prepare(
            "UPDATE nl_delivery_jobs SET status='accepted',provider_id=?,updated=? WHERE id=?",
          )
          .bind(id, now(), n.id),
        db
          .prepare("UPDATE nl_notifications SET status='accepted' WHERE id=?")
          .bind(n.id),
      ]);
      accepted++;
    } catch (e) {
      await db
        .prepare(
          "UPDATE nl_delivery_jobs SET status=?,next_at=?,error=?,updated=? WHERE id=?",
        )
        .bind(
          e.retryable ? "retry" : "needs_review",
          Date.now() + 60000 * Math.pow(2, n.attempts || 0),
          e.retryable ? "provider_rate_limit" : "delivery_not_confirmed",
          now(),
          n.id,
        )
        .run();
    }
  }
  return { accepted, ready: true };
}
export default {
  // Hosting must wire the scheduled event; Sites does not imply a cron binding.
  async scheduled(event, env, ctx) {
    const job = (async () => {
      await maintain(env);
      await dispatchNotifications(env);
    })();
    if (ctx?.waitUntil) ctx.waitUntil(job);
    await job;
  },
  async fetch(req, env, ctx) {
    try {
      const result = await handle(req, env);
      if (
        ctx?.waitUntil &&
        req.method === "POST" &&
        result.ok &&
        !new URL(req.url).pathname.includes("webhooks") &&
        integrationStatus(env).whatsapp
      )
        ctx.waitUntil(dispatchNotifications(env).catch(() => {}));
      return result;
    } catch (e) {
      const m = String(e.message || "");
      if (m.includes("UNIQUE constraint"))
        return json(
          { error: "السجل مكرر. راجع رقم الجوال أو البريد أو رقم الفاتورة." },
          409,
        );
      if (m.includes("no such table")) {
        console.error("Diwan storage error", m.slice(0, 300));
        return json({ error: "تعذر تجهيز مساحة العمل. حاول لاحقًا." }, 503);
      }
      if (/FOREIGN KEY|CHECK constraint|NOT NULL/.test(m))
        return json(
          { error: "تعارض في البيانات. حدّث الصفحة وراجع القيم." },
          409,
        );
      if (!e.status) console.error("Diwan request failed", e.name || "Error");
      return json(
        {
          error: e.status
            ? m
            : "تعذر إتمام الطلب. حاول مجددًا أو راجع إدارة الديوان.",
        },
        e.status || 500,
      );
    }
  },
};
