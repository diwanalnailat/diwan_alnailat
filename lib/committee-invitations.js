import { hmac, integrationError, integrationStatus } from "./integrations.js";

export function normalizeMemberPhone(value) {
  let phone = String(value || "")
    .trim()
    .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (n) => String(n.charCodeAt(0) - 1776))
    .replace(/[\s()-]/g, "");
  if (/^05\d{8}$/.test(phone)) phone = "+966" + phone.slice(1);
  else if (/^5\d{8}$/.test(phone)) phone = "+966" + phone;
  else if (/^00/.test(phone)) phone = "+" + phone.slice(2);
  else if (/^9665\d{8}$/.test(phone)) phone = "+" + phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw integrationError("أدخل رقم جوال صحيحًا مع رمز الدولة.");
  return phone;
}

// A random invitation ID and a server-only key derive a one-time credential.
// Neither the notification, API response nor audit record contains that credential.
export const invitationPassword = async (env, invite) =>
  (
    await hmac(
      env.OTP_SECRET,
      `manager-password|${invite.id}|${invite.site_id}|${invite.phone}|${invite.expires}`,
    )
  )
    .slice(0, 12)
    .toUpperCase();
export const invitationDigest = (env, invite, password) =>
  hmac(
    env.OTP_SECRET,
    `manager-verifier|${invite.id}|${invite.site_id}|${invite.phone}|${password}`,
  );

export async function managerInvitation(
  env,
  member,
  committee,
  project,
  role = null,
) {
  if (
    env.DIWAN_AUTH_ENABLED !== "true" ||
    !integrationStatus(env).phone ||
    !integrationStatus(env).whatsapp
  )
    throw integrationError(
      "إرسال الدعوة غير متاح حاليًا. راجع إعدادات الدخول وواتساب.",
      503,
    );
  const created = Date.now();
  const invite = {
    id: crypto.randomUUID(),
    site_id: role
      ? `person:${member.id}:${role.resource}:${role.entityId}:${role.role}`
      : `manager:${member.id}:${committee.id}`,
    phone: member.phone,
    expires: created + 86400000,
  };
  const digest = await invitationDigest(
    env,
    invite,
    await invitationPassword(env, invite),
  );
  const title =
    role?.title ||
    `تم تعيينك مديرًا للجنة ${committee.name} في مشروع ${project.title}`;
  const db = env.DB;
  return {
    id: invite.id,
    statements: [
      db
        .prepare(
          "UPDATE nl_otp SET used=1 WHERE phone=? AND (site_id LIKE 'manager:%' OR site_id LIKE 'person:%') AND used=0",
        )
        .bind(member.phone),
      db
        .prepare(
          "INSERT INTO nl_otp(id,site_id,phone,hash,expires,created) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          invite.id,
          invite.site_id,
          member.phone,
          digest,
          invite.expires,
          created,
        ),
      db
        .prepare("INSERT INTO nl_notifications VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(
          invite.id,
          member.id,
          title,
          role?.body || "يرجى زيارة المنصة للاطلاع على مهامك الموكلة إليك.",
          role?.resource || "committees",
          role?.entityId || committee.id,
          project?.id || null,
          "whatsapp",
          "queued",
          new Date(created).toISOString(),
        ),
      db
        .prepare("INSERT INTO nl_notifications VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          member.id,
          title,
          role?.body || "يرجى زيارة المنصة للاطلاع على مهامك الموكلة إليك.",
          role?.resource || "committees",
          role?.entityId || committee.id,
          project?.id || null,
          "in_app",
          "unread",
          new Date(created).toISOString(),
        ),
    ],
  };
}
