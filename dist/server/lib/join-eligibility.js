import { integrationError } from "./integrations.js";

export async function assertNewApplicant(db, phone) {
  const member = await db
    .prepare("SELECT id FROM nl_members WHERE phone=? LIMIT 1")
    .bind(phone)
    .first();
  if (member)
    throw integrationError(
      "رقم الجوال مسجل لعضو موجود بالفعل؛ لا يمكنك تقديم طلب انضمام جديد. استخدم دخول الديوان، أو تواصل مع الإدارة إذا تعذر الدخول.",
      409,
    );
}

// Repeat the condition inside the mutation transaction to close the read/write race.
// All member statuses count; a new request must not bypass an inactive membership.
export const newApplicantGuard = (db, phone) =>
  db
    .prepare(
      "INSERT INTO nl_guards(id,value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM nl_members WHERE phone=?) THEN 0 ELSE 1 END",
    )
    .bind(crypto.randomUUID(), phone);
