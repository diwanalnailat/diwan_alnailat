import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  equal,
  hmac,
  integrationError,
  integrationStatus,
  limit,
  limits,
  whatsapp,
} from "./integrations.js";
import { httpsOrigin, jsonBody } from "./security.js";
import {
  normalizeMemberPhone,
  invitationDigest,
} from "./committee-invitations.js";
import { permitted, withCommittees } from "./domain.js";
import { personInvitationEligible } from "./person-invitations.js";

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
export const normalizeLoginPhone = normalizeMemberPhone;
function ensureEnabled(env) {
  if (env.DIWAN_AUTH_ENABLED !== "true" || !integrationStatus(env).phone)
    throw integrationError("الدخول غير متاح مؤقتًا. حاول لاحقًا.", 503);
}
export function ensureOrigin(req, env) {
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const suppliedOrigin = req.headers.get("origin");
  let sameOrigin = suppliedOrigin === origin;
  // Next dev can construct its internal URL with localhost even when the
  // browser uses 127.0.0.1. Only allow loopback aliases on the same local port,
  // with the browser's Origin matching the actual HTTP Host header.
  if (!sameOrigin && env.NODE_ENV === "development") {
    try {
      const browserUrl = new URL(suppliedOrigin || "");
      const loopback = (url) =>
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      sameOrigin =
        loopback(requestUrl) &&
        loopback(browserUrl) &&
        suppliedOrigin === browserUrl.origin &&
        browserUrl.port === requestUrl.port &&
        req.headers.get("host") === browserUrl.host;
    } catch {
      sameOrigin = false;
    }
  }
  if (
    !sameOrigin ||
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
  await limits(env.DB, [
    ["login:global", 100, 3600],
    ["login:ip:" + hash(ip), 15, 900],
    ["login:cooldown:" + phoneKey, 1, 60],
    ["login:phone:" + phoneKey, 8, 3600],
  ]);
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
  return createSession(env, c, c.site_id.slice(6), invalid);
}
async function verifyInvitation(req, env) {
  ensureEnabled(env);
  const body = await jsonBody(req, 2048);
  const phone = normalizeMemberPhone(body.phone);
  const invalid = () =>
    integrationError(
      "كلمة المرور المؤقتة غير صحيحة أو انتهت صلاحيتها. يمكنك الدخول برمز واتساب.",
    );
  const ip = (req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  await limits(env.DB, [
    ["manager-login:ip:" + hash(ip), 30, 900],
    ["manager-login:phone:" + (await hmac(env.OTP_SECRET, phone)), 10, 900],
  ]);
  const c = await env.DB.prepare(
    "UPDATE nl_otp SET attempts=attempts+1 WHERE id=(SELECT id FROM nl_otp WHERE phone=? AND (site_id LIKE 'manager:%' OR site_id LIKE 'person:%') AND used=0 ORDER BY created DESC LIMIT 1) AND status='sent' AND expires>? AND attempts<5 RETURNING *",
  )
    .bind(phone, Date.now())
    .first();
  const code = String(body.code || "")
    .trim()
    .toUpperCase();
  if (
    !c ||
    !/^[A-F0-9]{12}$/.test(code) ||
    !equal(c.hash, await invitationDigest(env, c, code))
  )
    throw invalid();
  const [, memberId, committeeId] = c.site_id.split(":");
  const member = await env.DB.prepare(
    "SELECT * FROM nl_members WHERE id=? AND phone=? AND status='active'",
  )
    .bind(memberId, phone)
    .first();
  if (c.site_id.startsWith("person:")) {
    const snapshots = [];
    if (!(await personInvitationEligible(env.DB, c, member, snapshots)))
      throw invalid();
    return createSession(env, c, memberId, invalid, null, snapshots);
  }
  const committee = await env.DB.prepare(
    "SELECT * FROM nl_committees WHERE id=? AND manager_id=?",
  )
    .bind(committeeId, memberId)
    .first();
  const bundles = (await env.DB.prepare("SELECT * FROM nl_bundles").all())
    .results;
  if (
    !member ||
    !committee ||
    !permitted(
      withCommittees(member, [committee]),
      "committees",
      "view",
      committee,
      bundles,
    )
  )
    throw invalid();
  return createSession(env, c, memberId, invalid, committeeId);
}
async function createSession(
  env,
  c,
  memberId,
  invalid,
  committeeId = null,
  snapshots = [],
) {
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
      ...snapshots.flatMap((r) => [
        env.DB.prepare(
          `UPDATE ${r.table} SET version=version WHERE id=? AND version=?${r.guardSql || ""}`,
        ).bind(r.id, r.version, ...(r.guardArgs || [])),
        env.DB.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(
          crypto.randomUUID(),
        ),
      ]),
      env.DB.prepare(
        "UPDATE nl_otp SET used=1 WHERE id=? AND used=0 AND expires>? AND attempts<=5 AND (?='' OR EXISTS(SELECT 1 FROM nl_committees c JOIN nl_projects p ON p.id=c.project_id WHERE c.id=? AND c.manager_id=? AND p.status<>'closed'))",
      ).bind(c.id, now, committeeId || "", committeeId, memberId),
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
        "INSERT INTO nl_audit(id,actor,action,resource,entity_id,detail,created) VALUES(?,?,'login','users',?,?,?)",
      ).bind(
        crypto.randomUUID(),
        memberId,
        memberId,
        committeeId || snapshots.length ? "Person invitation" : "WhatsApp OTP",
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
    if (action === "invitation") return await verifyInvitation(req, env);
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
