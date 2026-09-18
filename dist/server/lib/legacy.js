/* One-time copy of the previous workspace. Original tables remain untouched. */
const rows = async (db, sql, ...args) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
export async function legacyInfo(db) {
  // The old pre-Diwan archive lives in SQLite, not the new PostgreSQL schema.
  if (db.dialect === "postgres")
    return { available: false, counts: {}, imported: false };
  const names = await rows(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('seasons','tasks','events','invoices','users')",
  );
  const set = new Set(names.map((r) => r.name));
  if (!set.has("seasons"))
    return { available: false, counts: {}, imported: false };
  const counts = {};
  for (const [table, label] of Object.entries({
    seasons: "مواسم",
    tasks: "مهام",
    events: "فعاليات",
    invoices: "فواتير",
    users: "أعضاء",
  })) {
    if (set.has(table)) {
      const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
      counts[label] = r.n;
    }
  }
  const marker = await db
    .prepare("SELECT key FROM nl_settings WHERE key='legacy_import'")
    .first();
  return { available: true, counts, imported: !!marker };
}
export async function legacyCopy(db, user, settings) {
  const info = await legacyInfo(db);
  if (!info.available)
    throw Object.assign(Error("لا توجد سجلات سابقة"), { status: 400 });
  if (info.imported)
    throw Object.assign(Error("تم استيراد النسخة السابقة بالفعل"), {
      status: 400,
    });
  const seasons = await rows(db, "SELECT * FROM seasons"),
    tasks = await rows(db, "SELECT * FROM tasks"),
    events = await rows(db, "SELECT * FROM events"),
    invoices = await rows(db, "SELECT * FROM invoices"),
    users = await rows(db, "SELECT * FROM users"),
    suppliers = await rows(db, "SELECT * FROM nl_suppliers"),
    existingMembers = await rows(db, "SELECT * FROM nl_members"),
    stmts = [],
    at = new Date().toISOString();
  const pid = (id) => "legacy-project-" + id;
  for (const u of users) {
    if (
      u.id === "owner" ||
      existingMembers.some((m) => u.phone && m.phone === u.phone)
    )
      continue;
    stmts.push(
      db
        .prepare(
          "INSERT INTO nl_members(id,name,phone,status,grants,bundles,team,created) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          "legacy-member-" + u.id,
          u.name,
          u.phone,
          "pending",
          "[]",
          "[]",
          "سجل سابق",
          at,
        ),
    );
  }
  for (const p of seasons)
    stmts.push(
      db
        .prepare(
          "INSERT INTO nl_projects(id,title,description,season,status,start,due,budget,meta,created_by,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          pid(p.id),
          p.name,
          "نسخة من السجل السابق - يرجى مراجعة البيانات.",
          String(p.year),
          "onhold",
          p.start_date,
          p.end_date,
          p.budget,
          JSON.stringify({
            sections: ["المهام السابقة", "الفعاليات السابقة"],
            legacyId: p.id,
          }),
          user.id,
          p.created_at,
        ),
    );
  for (const t of tasks)
    stmts.push(
      db
        .prepare(
          "INSERT INTO nl_tasks(id,project_id,title,description,assignee_id,due,priority,status,meta,created_by,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          "legacy-task-" + t.id,
          pid(t.season_id),
          t.title,
          "المسؤول السابق: " + t.assignee,
          null,
          t.due_date,
          settings.priorities.some((p) => p.id === t.priority)
            ? t.priority
            : "normal",
          t.status === "done"
            ? settings.taskStatuses.find((s) => s.done).id
            : settings.taskStatuses[0].id,
          JSON.stringify({
            section: t.committee || "المهام السابقة",
            legacyId: t.id,
            legacyStatus: t.status,
            checklist: [],
            dependencies: [],
            collaborators: [],
          }),
          user.id,
          t.created_at,
          at,
        ),
    );
  for (const e of events)
    stmts.push(
      db
        .prepare(
          "INSERT INTO nl_tasks(id,project_id,title,description,start,due,priority,status,meta,created_by,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          "legacy-event-" + e.id,
          pid(e.season_id),
          e.title,
          "الموقع: " + e.location,
          e.event_date,
          e.event_date,
          "normal",
          settings.taskStatuses[0].id,
          JSON.stringify({
            section: "الفعاليات السابقة",
            legacyId: e.id,
            legacyStatus: e.status,
            checklist: [],
            dependencies: [],
            collaborators: [],
          }),
          user.id,
          e.created_at,
          at,
        ),
    );
  const vendors = new Map(suppliers.map((s) => [s.name, s.id]));
  for (const e of invoices) {
    let supplier = vendors.get(e.vendor);
    if (!supplier) {
      supplier = crypto.randomUUID();
      vendors.set(e.vendor, supplier);
      stmts.push(
        db
          .prepare(
            "INSERT INTO nl_suppliers(id,name,notes,created_by,created) VALUES(?,?,?,?,?)",
          )
          .bind(supplier, e.vendor, "مستورد من السجلات السابقة", user.id, at),
      );
    }
    stmts.push(
      db
        .prepare(
          "INSERT INTO nl_expenses(id,project_id,supplier_id,title,number,category,amount,tax,date,status,meta,created_by,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          "legacy-expense-" + e.id,
          pid(e.season_id),
          supplier,
          "فاتورة " + e.vendor,
          e.number,
          e.category,
          e.amount,
          0,
          e.created_at.slice(0, 10),
          "draft",
          JSON.stringify({
            notes:
              e.notes +
              "\nالحالة السابقة: " +
              e.status +
              "\nتحتاج الضريبة والاعتماد إلى مراجعة.",
            legacyId: e.id,
            route: [],
            approvalIndex: 0,
            approvals: [],
          }),
          user.id,
          e.created_at,
        ),
    );
    if (e.file_data && e.file_name)
      stmts.push(
        db
          .prepare(
            "INSERT INTO nl_files(id,entity_type,entity_id,name,mime,size,object_key,created_by,created) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            "legacy-file-" + e.id,
            "expenses",
            "legacy-expense-" + e.id,
            e.file_name,
            e.file_type || "application/octet-stream",
            Math.floor(e.file_data.length * 0.75),
            "legacy:" + e.id,
            user.id,
            e.created_at,
          ),
      );
  }
  stmts.push(
    db
      .prepare(
        "INSERT INTO nl_settings(key,value,version) VALUES('legacy_import',?,1)",
      )
      .bind(JSON.stringify({ at, by: user.id, counts: info.counts })),
  );
  return { stmts, counts: info.counts };
}
