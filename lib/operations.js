import { integrationStatus, rows, row, stamp } from "./integrations.js";
import { httpsOrigin } from "./security.js";
import { parse, permitted, withCommittees } from "./domain.js";
import { committeeConfig, secondApprover } from "./governance.js";
import { sanadConfig, SANAD_POLICY_VERSION } from "./sanad-policy.js";

// Machine-readable setup contract. Values and secrets are never returned.
export const INTEGRATION_REQUIREMENTS = {
  ai: ["OPENAI_API_KEY", "OPENAI_MODEL"],
  voice: ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_TRANSCRIBE_MODEL"],
  whatsapp: [
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_ID",
    "WHATSAPP_API_VERSION",
    "WHATSAPP_NOTIFICATION_TEMPLATE",
    "APP_BASE_URL",
  ],
  phone: [
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_ID",
    "WHATSAPP_API_VERSION",
    "WHATSAPP_OTP_TEMPLATE",
    "OTP_SECRET",
  ],
  webhook: ["WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"],
};
export async function readiness(env, c) {
  const flags = integrationStatus(env);
  const requirements =
    env.WHATSAPP_PROVIDER === "green_api"
      ? {
          ...INTEGRATION_REQUIREMENTS,
          whatsapp: [
            "GREEN_API_URL",
            "GREEN_API_INSTANCE",
            "GREEN_API_TOKEN",
            "APP_BASE_URL",
          ],
          phone: [
            "GREEN_API_URL",
            "GREEN_API_INSTANCE",
            "GREEN_API_TOKEN",
            "OTP_SECRET",
          ],
          webhook: [],
        }
      : INTEGRATION_REQUIREMENTS;
  const components = Object.entries(requirements).map(([id, keys]) => ({
    id,
    status:
      id === "webhook" && env.WHATSAPP_PROVIDER === "green_api"
        ? "not_configured"
        : flags[id]
          ? "configured_unverified"
          : "needs_configuration",
    missing: keys.filter((k) => !String(env[k] || "").trim()),
  }));
  const members = await rows(env.DB, "SELECT * FROM nl_members");
  const issues = [];
  for (const k of c.committees) {
    if (!c.can("committees", "view", k)) continue;
    if (c.projectRows.find((p) => p.id === k.project_id)?.status === "closed")
      continue;
    const route = [k.manager_id, secondApprover(k)];
    if (!route[0] || !route[1] || route[0] === route[1])
      issues.push({
        id: k.id,
        resource: "committees",
        title: k.name,
        issue: "مسار الاعتماد غير مكتمل؛ يلزم شخصان مختلفان",
      });
    for (const id of [...route, committeeConfig(k).review_delegate_id].filter(
      Boolean,
    )) {
      const m = members.find((m) => m.id === id);
      if (
        !m ||
        !["view", "approve"].every((action) =>
          permitted(
            withCommittees(m, c.committees),
            "expenses",
            action,
            { project_id: k.project_id, committee_id: k.id },
            c.bundles,
          ),
        )
      )
        issues.push({
          id: k.id,
          resource: "committees",
          title: k.name,
          issue: "أحد المعتمدين غير نشط أو لا يملك الصلاحية المطلوبة",
        });
    }
    if (!committeeConfig(k).budgetLines.some((l) => l.active !== false))
      issues.push({
        id: k.id,
        resource: "committees",
        title: k.name,
        issue: "لا توجد بنود صرف مفعّلة",
      });
    if (!committeeConfig(k).review_delegate_id)
      issues.push({
        id: k.id,
        resource: "committees",
        title: k.name,
        issue: "لم يُحدد بديل؛ مصروف أحد المعتمدين سيتوقف حتى تعيينه",
      });
  }
  return {
    checked_at: stamp(),
    policy_version: SANAD_POLICY_VERSION,
    components,
    issues,
    configuration_issues: [
      ...(!httpsOrigin(env.APP_BASE_URL)
        ? ["APP_BASE_URL يحتاج أصل HTTPS صالحًا دون مسار"]
        : []),
      ...(env.OTP_SECRET && env.OTP_SECRET.length < 32
        ? ["OTP_SECRET يجب ألا يقل عن 32 حرفًا عشوائيًا"]
        : []),
      ...(env.WHATSAPP_API_VERSION &&
      !/^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION)
        ? ["صيغة إصدار واجهة واتساب غير صحيحة"]
        : []),
    ],
    external_gates: [
      "تأكيد إرسال رمز ورسالة واتساب فعليين بعد تهيئة المزود",
      "اختبار سند والفواتير والصوت على النموذج المختار بعد ربطه",
      "الدخول المستقل بالجوال يحتاج مزود هوية وجلسات على الاستضافة المستهدفة؛ التوثيق الحالي مرتبط بدخول Sites",
      env.WHATSAPP_PROVIDER === "green_api"
        ? "Green API يسجل قبول الرسالة في الطابور؛ تأكيد التسليم عبر webhook لم يُفعّل"
        : "مستقبل إشعارات Meta يحتاج عنوانًا يصل إليه المزود؛ الموقع الحالي خاص",
      "تشغيل المجدول دوريًا على الاستضافة المستهدفة؛ زر الصيانة يعمل يدويًا الآن",
      "تجربة النسخ الاحتياطي والاستعادة وفحص المرفقات واختبار أمني قبل التوسع",
    ],
    maintenance: parse(
      (
        await row(
          env.DB,
          "SELECT value FROM nl_settings WHERE key='maintenance:last'",
        )
      )?.value,
      null,
    ),
    deliveries: await rows(
      env.DB,
      "SELECT status,count(*) AS count FROM nl_delivery_jobs GROUP BY status",
    ),
    agent: {
      retention_days: sanadConfig(c.settings).retention_days,
      turns:
        (await row(env.DB, "SELECT count(*) AS total FROM nl_agent_turns"))
          ?.total || 0,
    },
  };
}
export async function maintain(env) {
  const db = env.DB,
    at = Date.now();
  const lease = await db
    .prepare(
      "INSERT INTO nl_integration_limits(key,hits,expires) VALUES('maintenance:lease',1,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE nl_integration_limits.expires<? RETURNING key",
    )
    .bind(at + 60000, at)
    .first();
  if (!lease) return { skipped: true };
  const settings = parse(
    (await row(db, "SELECT value FROM nl_settings WHERE key='workspace'"))
      ?.value,
  );
  const cutoff = new Date(
    at - sanadConfig(settings).retention_days * 86400000,
  ).toISOString();
  await db.batch([
    db.prepare("DELETE FROM nl_agent_turns WHERE created<?").bind(cutoff),
    db.prepare("DELETE FROM nl_otp WHERE expires<?").bind(at - 86400000),
    db
      .prepare(
        "DELETE FROM nl_integration_limits WHERE expires<? AND key<>'maintenance:lease'",
      )
      .bind(at - 86400000),
    db
      .prepare(
        "UPDATE nl_delivery_jobs SET status='needs_review',error='sending_not_confirmed',updated=? WHERE status='sending' AND updated<?",
      )
      .bind(stamp(), new Date(at - 300000).toISOString()),
    db
      .prepare(
        "UPDATE nl_delivery_jobs SET status='needs_review',error='retry_limit',updated=? WHERE status='retry' AND attempts>=4",
      )
      .bind(stamp()),
  ]);
  let reminders = 0;
  if (settings.notifications?.taskDue !== false) {
    const today = new Date(at + 3 * 3600000).toISOString().slice(0, 10),
      tomorrow = new Date(at + 27 * 3600000).toISOString().slice(0, 10);
    const tasks = await rows(
      db,
      "SELECT t.* FROM nl_tasks t JOIN nl_projects p ON p.id=t.project_id WHERE t.due<=? AND t.status<>'done' AND p.status<>'closed' AND t.assignee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM nl_notifications n WHERE n.id='due_'||t.id||'_'||?||'_in_app') ORDER BY t.due LIMIT 100",
      tomorrow,
      today,
    );
    const committees = await rows(db, "SELECT * FROM nl_committees"),
      bundles = await rows(db, "SELECT * FROM nl_bundles");
    for (const t of tasks) {
      const m = await row(
        db,
        "SELECT * FROM nl_members WHERE id=?",
        t.assignee_id,
      );
      if (
        !m ||
        !permitted(withCommittees(m, committees), "tasks", "view", t, bundles)
      )
        continue;
      for (const channel of ["in_app", "whatsapp"]) {
        const result = await db
          .prepare(
            "INSERT OR IGNORE INTO nl_notifications VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            "due_" + t.id + "_" + today + "_" + channel,
            m.id,
            t.due < today
              ? "مهمة تجاوزت موعد التسليم"
              : "تذكير بموعد تسليم المهمة",
            t.title,
            "tasks",
            t.id,
            t.project_id,
            channel,
            channel === "in_app" ? "unread" : "not_connected",
            stamp(),
          )
          .run();
        if (channel === "in_app") reminders += result.meta?.changes || 0;
      }
    }
  }
  const result = {
    completed_at: stamp(),
    reminders,
    retention_days: sanadConfig(settings).retention_days,
  };
  await db
    .prepare(
      "INSERT INTO nl_settings(key,value,version) VALUES('maintenance:last',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=nl_settings.version+1",
    )
    .bind(JSON.stringify(result))
    .run();
  return result;
}
