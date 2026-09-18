import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  equal,
  hmac,
  integrationError,
  integrationStatus,
  limit,
  whatsapp,
} from "./integrations.js";
import { httpsOrigin, jsonBody } from "./security.js";

export const SESSION_COOKIE = "__Host-diwan-session";
const CHALLENGE_COOKIE = "__Host-diwan-challenge";
const SESSION_SECONDS = 12 * 60 * 60;
const tokenPattern = /^[a-f0-9]{64}$/;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const freshToken = () => randomBytes(32).toString("hex");
export const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const reply = (body, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
const cookie = (req, name) =>
  (req.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1) || "";
const cookieHeader = (name, value, age) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export function normalizeLoginPhone(value) {
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
function ensureEnabled(env) {
  if (env.DIWAN_AUTH_ENABLED !== "true" || !integrationStatus(env).phone)
    throw integrationError("الدخول غير متاح مؤقتًا. حاول لاحقًا.", 503);
}
function ensureOrigin(req, env) {
  const origin = new URL(req.url).origin;
  if (
    req.headers.get("origin") !== origin ||
    req.headers.get("sec-fetch-site") === "cross-site" ||
    (env.NODE_ENV === "production" && origin !== httpsOrigin(env.APP_BASE_URL))
  )
    throw integrationError("طلب غير موثوق. أعد فتح صفحة الدخول.", 403);
}
async function requestCode(req, env) {
  ensureEnabled(env);
  const body = await jsonBody(req, 2048);
  const phone = normalizeLoginPhone(body.phone);
  if (body.consent !== true)
    throw integrationError("وافق على استلام رمز الدخول عبر واتساب.");
  const ip = (req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  const phoneKey = await hmac(env.OTP_SECRET, "login-phone:" + phone);
  await limit(env.DB, "login:global", 100, 3600);
  await limit(env.DB, "login:ip:" + hash(ip), 15, 900);
  await limit(env.DB, "login:cooldown:" + phoneKey, 1, 60);
  await limit(env.DB, "login:phone:" + phoneKey, 8, 3600);
  const member = await env.DB.prepare(
    "SELECT id,phone FROM nl_members WHERE phone=? AND status='active'",
  )
    .bind(phone)
    .first();
  const id = crypto.randomUUID();
  const existingBinding = cookie(req, CHALLENGE_COOKIE);
  const binding = tokenPattern.test(existingBinding)
    ? existingBinding
    : freshToken();
  if (member) {
    const site = "login:" + member.id;
    const code = String(randomInt(1000000)).padStart(6, "0");
    const digest = await hmac(
      env.OTP_SECRET,
      `${id}|${site}|${phone}|${binding}|${code}`,
    );
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE nl_otp SET used=1 WHERE site_id=? AND used=0",
      ).bind(site),
      env.DB.prepare(
        "INSERT INTO nl_otp(id,site_id,phone,hash,expires,created) VALUES(?,?,?,?,?,?)",
      ).bind(id, site, phone, digest, now + 300000, now),
    ]);
    try {
      await whatsapp(env, phone, env.WHATSAPP_OTP_TEMPLATE, [code], true);
      await env.DB.prepare(
        "UPDATE nl_otp SET status='sent' WHERE id=? AND used=0",
      )
        .bind(id)
        .run();
    } catch {
      await env.DB.prepare(
        "UPDATE nl_otp SET status='failed',used=1 WHERE id=?",
      )
        .bind(id)
        .run();
      // Same response as an unregistered number; never disclose membership.
    }
  }
  const response = reply({
    challenge_id: id,
    expires_in: 300,
    retry_after: 60,
    message: "إذا كان الرقم مسجلًا ومفعّلًا، سيصلك رمز الدخول عبر واتساب.",
  });
  response.headers.append(
    "Set-Cookie",
    cookieHeader(CHALLENGE_COOKIE, binding, 600),
  );
  return response;
}
async function verifyCode(req, env) {
  ensureEnabled(env);
  const body = await jsonBody(req, 2048);
  const binding = cookie(req, CHALLENGE_COOKIE);
  const id = String(body.challenge_id || "");
  const code = String(body.code || "");
  const invalid = () =>
    integrationError("الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا.");
  if (!tokenPattern.test(binding) || !/^[a-f0-9-]{36}$/.test(id))
    throw invalid();
  await limit(env.DB, "login:verify:" + hash(binding), 30, 900);
  const c = await env.DB.prepare(
    "UPDATE nl_otp SET attempts=attempts+1 WHERE id=? AND site_id LIKE 'login:%' AND used=0 AND status='sent' AND expires>? AND attempts<5 RETURNING *",
  )
    .bind(id, Date.now())
    .first();
  if (
    !c ||
    !/^\d{6}$/.test(code) ||
    !equal(
      c.hash,
      await hmac(
        env.OTP_SECRET,
        `${c.id}|${c.site_id}|${c.phone}|${binding}|${code}`,
      ),
    )
  )
    throw invalid();
  const memberId = c.site_id.slice(6);
  const session = freshToken();
  const now = Date.now();
  const member = await env.DB.prepare(
    "SELECT id FROM nl_members WHERE id=? AND phone=? AND status='active'",
  )
    .bind(memberId, c.phone)
    .first();
  if (!member) throw invalid();
  try {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE nl_otp SET used=1 WHERE id=? AND used=0 AND expires>? AND attempts<=5",
      ).bind(c.id, now),
      env.DB.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(
        crypto.randomUUID(),
      ),
      env.DB.prepare(
        "UPDATE nl_members SET verified=1,version=version+1 WHERE id=? AND phone=? AND status='active'",
      ).bind(memberId, c.phone),
      env.DB.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(
        crypto.randomUUID(),
      ),
      env.DB.prepare(
        "INSERT INTO nl_sessions(hash,member_id,phone,expires,created) VALUES(?,?,?,?,?)",
      ).bind(
        hash(session),
        memberId,
        c.phone,
        now + SESSION_SECONDS * 1000,
        now,
      ),
      env.DB.prepare(
        "INSERT INTO nl_audit(id,actor,action,resource,entity_id,detail,created) VALUES(?,?,'login','users',?,'WhatsApp OTP',?)",
      ).bind(
        crypto.randomUUID(),
        memberId,
        memberId,
        new Date(now).toISOString(),
      ),
    ]);
  } catch (error) {
    if (
      error.code === "23514" ||
      String(error.message).includes("nl_guard_changed")
    )
      throw invalid();
    throw error;
  }
  const response = reply({ ok: true, redirect: "/workspace#overview" });
  response.headers.append(
    "Set-Cookie",
    cookieHeader(SESSION_COOKIE, session, SESSION_SECONDS),
  );
  response.headers.append("Set-Cookie", cookieHeader(CHALLENGE_COOKIE, "", 0));
  return response;
}
export async function sessionMember(req, env) {
  if (env.DIWAN_AUTH_ENABLED !== "true") return null;
  const token = cookie(req, SESSION_COOKIE);
  if (!tokenPattern.test(token)) return null;
  return env.DB.prepare(
    "SELECT m.* FROM nl_sessions s JOIN nl_members m ON m.id=s.member_id WHERE s.hash=? AND s.expires>? AND s.phone=m.phone AND m.status='active' AND m.verified=1",
  )
    .bind(hash(token), Date.now())
    .first();
}
export async function loginEndpoint(req, env, action) {
  try {
    ensureOrigin(req, env);
    if (action === "request") return await requestCode(req, env);
    if (action === "verify") return await verifyCode(req, env);
    if (action === "logout") {
      const token = cookie(req, SESSION_COOKIE);
      if (tokenPattern.test(token))
        await env.DB.prepare("DELETE FROM nl_sessions WHERE hash=?")
          .bind(hash(token))
          .run();
      const response = new Response(null, {
        status: 303,
        headers: { ...privateHeaders, Location: "/login" },
      });
      response.headers.append(
        "Set-Cookie",
        cookieHeader(SESSION_COOKIE, "", 0),
      );
      response.headers.append(
        "Set-Cookie",
        cookieHeader(CHALLENGE_COOKIE, "", 0),
      );
      return response;
    }
    return reply({ error: "الطلب غير متاح." }, 404);
  } catch (error) {
    return reply(
      {
        error: error.status ? error.message : "تعذر إكمال الدخول. حاول لاحقًا.",
      },
      error.status || 503,
    );
  }
}
