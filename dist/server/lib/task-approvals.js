import { parse, string, choice, fieldVisible } from "./domain.js";

export const TASK_ADMIN_ACTIONS = {
  approve: "الموافقة على الاعتماد",
  hold: "تعليق الاعتماد مؤقتًا",
  refer_finance: "التوجيه للمالية",
  request_info: "طلب إيضاح",
  stop_payment: "إيقاف الصرف",
  resume_payment: "استئناف الصرف",
};
const scope = (row) => {
  const snapshot = parse(row.snapshot);
  return {
    ...row,
    id: row.task_id,
    created_by: snapshot.created_by,
    assignee_id: snapshot.assignee_id,
    meta: { collaborators: snapshot.collaborators || [] },
  };
};
const one = async (db, sql, ...args) =>
  db
    .prepare(sql)
    .bind(...args)
    .first();

export function completionApprovalStatement(
  db,
  task,
  committee,
  actor,
  note,
  at,
) {
  const meta = parse(task.meta);
  const snapshot = {
    title: task.title,
    description: task.description,
    assignee_id: task.assignee_id,
    created_by: task.created_by,
    collaborators: meta.collaborators || [],
    type: meta.type,
    outcome: meta.outcome,
    completion_note: meta.completion_note,
    checklist: meta.checklist || [],
    reviewer_id: actor.id,
    reviewer_name: actor.name,
    approved_at: at,
    approval_note: note,
  };
  return db
    .prepare(
      "INSERT INTO nl_task_approvals(task_id,project_id,committee_id,status,snapshot,created,updated) VALUES(?,?,?,'pending',?,?,?) ON CONFLICT(task_id) DO UPDATE SET status='pending',snapshot=excluded.snapshot,updated=excluded.updated,version=nl_task_approvals.version+1",
    )
    .bind(
      task.id,
      task.project_id,
      committee.id,
      JSON.stringify(snapshot),
      at,
      at,
    );
}

export async function taskApprovalList(db, c, params) {
  const filters = [],
    args = [];
  for (const [key, column] of [
    ["project", "project_id"],
    ["committee", "committee_id"],
    ["cursor", "task_id"],
  ]) {
    const value = params.get(key);
    if (value) {
      filters.push(`${column}${key === "cursor" ? ">" : "="}?`);
      args.push(string(value, 100));
    }
  }
  if (params.get("status")) {
    filters.push("status=?");
    args.push(
      choice(params.get("status"), [
        "pending",
        "approved",
        "on_hold",
        "finance",
        "clarification",
      ]),
    );
  }
  // Bounded scanning and keyset pagination; permission filtering remains authoritative.
  const { results } = await db
    .prepare(
      `SELECT * FROM nl_task_approvals ${filters.length ? "WHERE " + filters.join(" AND ") : ""} ORDER BY task_id LIMIT 51`,
    )
    .bind(...args)
    .all();
  const candidates = results
    .slice(0, 50)
    .filter((row) => c.can("task_approvals", "view", scope(row)));
  const tasks = candidates.length
    ? (
        await db
          .prepare(
            `SELECT * FROM nl_tasks WHERE id IN (${candidates.map(() => "?").join(",")})`,
          )
          .bind(...candidates.map((row) => row.task_id))
          .all()
      ).results
    : [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const rows = [];
  for (const row of candidates) {
    const task = taskById.get(row.task_id);
    if (!task || !c.can("tasks", "view", task)) continue;
    rows.push({
      ...row,
      snapshot: parse(row.snapshot),
      actions: Object.keys(TASK_ADMIN_ACTIONS).filter((a) =>
        c.can("task_approvals", a, scope(row)),
      ),
    });
  }
  return {
    rows,
    next_cursor: results.length > 50 ? results[49].task_id : null,
  };
}

export async function taskApprovalDetail(db, c, id) {
  const row = await one(
    db,
    "SELECT * FROM nl_task_approvals WHERE task_id=?",
    string(id, 100),
  );
  if (!row)
    throw Object.assign(new Error("اعتماد المهمة غير موجود"), { status: 404 });
  c.need("task_approvals", "view", scope(row));
  const task = await one(db, "SELECT * FROM nl_tasks WHERE id=?", id);
  if (!task)
    throw Object.assign(new Error("المهمة غير موجودة"), { status: 404 });
  c.need("tasks", "view", task);
  const { results: allExpenses } = await db
    .prepare(
      "SELECT * FROM nl_expenses WHERE project_id=? AND json_extract(meta,'$.task_id')=?",
    )
    .bind(row.project_id, id)
    .all();
  const expenses = allExpenses.filter((e) => c.can("expenses", "view", e));
  const costVisible =
    c.can("expenses", "view", {
      project_id: row.project_id,
      committee_id: row.committee_id,
    }) &&
    expenses.every((e) =>
      fieldVisible(c.u, "expenses", "amount", e, c.bundles),
    ) &&
    expenses.length === allExpenses.length;
  const { results: history } = await db
    .prepare(
      "SELECT actor,action,detail,created FROM nl_audit WHERE resource='task_approvals' AND entity_id=? ORDER BY created DESC LIMIT 100",
    )
    .bind(id)
    .all();
  const snapshot = parse(row.snapshot);
  const ids = [
    ...new Set(
      [
        snapshot.assignee_id,
        snapshot.reviewer_id,
        ...(snapshot.collaborators || []),
        ...history.map((h) => h.actor),
      ].filter(Boolean),
    ),
  ];
  const people = ids.length
    ? (
        await db
          .prepare(
            `SELECT id,name FROM nl_members WHERE id IN (${ids.map(() => "?").join(",")})`,
          )
          .bind(...ids)
          .all()
      ).results
    : [];
  return {
    ...row,
    snapshot,
    people,
    history,
    project: (
      await one(db, "SELECT title FROM nl_projects WHERE id=?", row.project_id)
    )?.title,
    committee: c.committees.find((item) => item.id === row.committee_id)?.name,
    execution_status: task.status,
    cost: costVisible
      ? allExpenses
          .filter((e) => !["rejected", "cancelled"].includes(e.status))
          .reduce((sum, e) => sum + e.amount, 0)
      : null,
    expenses: expenses.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      amount: fieldVisible(c.u, "expenses", "amount", e, c.bundles)
        ? e.amount
        : null,
    })),
    actions: Object.keys(TASK_ADMIN_ACTIONS).filter((a) =>
      c.can("task_approvals", a, scope(row)),
    ),
  };
}

export async function taskApprovalDecision(db, c, body) {
  if (!Number.isSafeInteger(body.version) || body.version < 1)
    throw Object.assign(new Error("إصدار الاعتماد غير صالح؛ حدّث البيانات"), {
      status: 400,
    });
  const row = await taskApprovalDetail(db, c, body.id);
  const action = choice(body.action, Object.keys(TASK_ADMIN_ACTIONS));
  c.need("task_approvals", action, scope(row));
  const note = string(body.note, 2000);
  const next =
    {
      approve: "approved",
      hold: "on_hold",
      refer_finance: "finance",
      request_info: "clarification",
    }[action] || row.status;
  const hold =
    action === "stop_payment"
      ? 1
      : action === "resume_payment"
        ? 0
        : row.payment_hold;
  const at = new Date().toISOString();
  return {
    result: { id: body.id, status: next, payment_hold: hold },
    statements: [
      db
        .prepare(
          "UPDATE nl_task_approvals SET status=?,payment_hold=?,updated=?,version=version+1 WHERE task_id=? AND version=?",
        )
        .bind(next, hold, at, body.id, body.version),
      db
        .prepare(
          "INSERT INTO nl_audit(id,actor,action,resource,entity_id,project_id,detail,created) VALUES(?,?,?,'task_approvals',?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          c.u.id,
          action,
          body.id,
          row.project_id,
          note,
          at,
        ),
    ],
  };
}

// Evaluated in the SAME atomic batch as settlement: a hold committed before
// settlement blocks it. A later hold cannot reverse an already committed payment.
export function taskPaymentGuard(db, expense) {
  const taskId = parse(expense.meta).task_id;
  return taskId
    ? [
        db
          .prepare(
            "INSERT INTO nl_guards(id,value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM nl_task_approvals WHERE task_id=? AND payment_hold=1) THEN 0 ELSE 1 END",
          )
          .bind(crypto.randomUUID(), taskId),
      ]
    : [];
}
