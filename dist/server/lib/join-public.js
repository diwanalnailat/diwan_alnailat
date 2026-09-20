import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  equal,
  hmac,
  limit,
  limits,
  whatsapp,
  integrationStatus,
  integrationError,
} from "./integrations.js";
import { normalizeLoginPhone, ensureOrigin, privateHeaders } from "./login.js";
import { jsonBody } from "./security.js";
import { string } from "./domain.js";
import { joinPolicy, joinAdminNotices } from "./join-requests.js";

const COOKIE = "__Host-diwan-join";
const tokenPattern = /^[a-f0-9]{64}$/;
const hash = (s) => createHash("sha256").update(s).digest("hex");
const bindingOf = (req) =>
  (req.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1) || "";
const cookie = (binding, age = 600) =>
  `${COOKIE}=${binding}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const reply = (body, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
const guard = (db) =>
  db
    .prepare("INSERT INTO nl_guards VALUES(?,changes())")
    .bind(crypto.randomUUID());
const policyGuard = (db, version) =>
  db
    .prepare(
      "INSERT INTO nl_guards(id,value) SELECT ?,CASE WHEN COALESCE((SELECT version FROM nl_settings WHERE key='join_policy'),0)=? THEN 1 ELSE 0 END",
    )
    .bind(crypto.randomUUID(), version);
const activeCommittee = (db, id) =>
  id
    ? db
        .prepare(
          "SELECT c.id,c.name,c.project_id,c.version FROM nl_committees c JOIN nl_projects p ON p.id=c.project_id WHERE c.id=? AND p.status='active'",
        )
        .bind(id)
        .first()
    : null;
export async function publicJoinOptions(env) {
  const [committees, policy] = await Promise.all([
    env.DB.prepare(
      "SELECT c.id,c.name,p.title AS project_title FROM nl_committees c JOIN nl_projects p ON p.id=c.project_id WHERE p.status='active' ORDER BY p.created DESC,c.name",
    ).all(),
    joinPolicy(env.DB),
  ]);
  return { committees: committees.results, policy };
}
async function requestCode(req, env) {
  const b = await jsonBody(req, 8192);
  const name = string(b.name, 120),
    reason = string(b.reason, 2000),
    phone = normalizeLoginPhone(b.phone);
  if (name.length < 2 || reason.length < 5)
    throw integrationError("اكتب اسمك وسبب الانضمام بوضوح.");
  const policy = await joinPolicy(env.DB);
  if (b.consent !== true)
    throw integrationError("وافق على شروط وسياسة الانضمام واستلام رمز التحقق.");
  if (b.policy_version !== policy.version)
    throw integrationError(
      "تغيرت شروط الانضمام. حدّث الصفحة واقرأها ثم وافق عليها.",
      409,
    );
  const committeeId = b.committee_id ? string(b.committee_id, 100) : null;
  const committee = await activeCommittee(env.DB, committeeId);
  if (committeeId && !committee)
    throw integrationError(
      "اللجنة لم تعد متاحة. حدّث القائمة أو قدّم للديوان مباشرة.",
      409,
    );
  const ip = (req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  const phoneKey = await hmac(env.OTP_SECRET, "join-phone:" + phone);
  await limits(env.DB, [
    ["join:global", 100, 3600],
    ["join:ip:" + hash(ip), 15, 900],
    ["join:cooldown:" + phoneKey, 1, 60],
    ["join:phone:" + phoneKey, 8, 3600],
  ]);
  const requestId = crypto.randomUUID(),
    id = crypto.randomUUID();
  const prior = bindingOf(req),
    binding = tokenPattern.test(prior)
      ? prior
      : randomBytes(32).toString("hex");
  const site = "join:" + requestId;
  const code = String(randomInt(1000000)).padStart(6, "0");
  const digest = await hmac(
    env.OTP_SECRET,
    `${id}|${site}|${phone}|${binding}|${code}`,
  );
  const now = Date.now(),
    created = new Date(now).toISOString();
  await env.DB.batch([
    policyGuard(env.DB, policy.version),
    env.DB.prepare(
      "UPDATE nl_otp SET used=1 WHERE phone=? AND site_id LIKE 'join:%' AND used=0",
    ).bind(phone),
    env.DB.prepare(
      "INSERT INTO nl_join_requests(id,name,phone,reason,committee_id,policy_version,policy_snapshot,consent_at,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      requestId,
      name,
      phone,
      reason,
      committeeId,
      policy.version,
      JSON.stringify(policy),
      created,
      created,
      created,
    ),
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
    await env.DB.prepare("UPDATE nl_otp SET status='failed',used=1 WHERE id=?")
      .bind(id)
      .run();
    throw integrationError(
      "تعذر تأكيد إرسال الرمز. انتظر دقيقة ثم أعد المحاولة.",
      502,
    );
  }
  const res = reply({
    challenge_id: id,
    expires_in: 300,
    retry_after: 60,
    message:
      "أُرسل طلب رمز التحقق إلى واتساب. أدخل الرمز لإرسال طلب انضمامك للإدارة.",
  });
  res.headers.append("Set-Cookie", cookie(binding));
  return res;
}
async function verifyCode(req, env) {
  const b = await jsonBody(req, 2048),
    binding = bindingOf(req),
    id = String(b.challenge_id || ""),
    code = String(b.code || "");
  const invalid = () =>
    integrationError("الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا.");
  if (!tokenPattern.test(binding) || !/^[a-f0-9-]{36}$/.test(id))
    throw invalid();
  await limit(env.DB, "join:verify:" + hash(binding), 30, 900);
  const otp = await env.DB.prepare(
    "UPDATE nl_otp SET attempts=attempts+1 WHERE id=? AND site_id LIKE 'join:%' AND used=0 AND status='sent' AND expires>? AND attempts<5 RETURNING *",
  )
    .bind(id, Date.now())
    .first();
  if (
    !otp ||
    !/^\d{6}$/.test(code) ||
    !equal(
      otp.hash,
      await hmac(
        env.OTP_SECRET,
        `${otp.id}|${otp.site_id}|${otp.phone}|${binding}|${code}`,
      ),
    )
  )
    throw invalid();
  const [row, policy] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM nl_join_requests WHERE id=? AND phone=? AND status='verifying'",
    )
      .bind(otp.site_id.slice(5), otp.phone)
      .first(),
    joinPolicy(env.DB),
  ]);
  if (!row) throw invalid();
  if (policy.version !== row.policy_version)
    throw integrationError(
      "تغيرت شروط الانضمام. حدّث الصفحة ووافق على النسخة الجديدة.",
      409,
    );
  const [committee, pending] = await Promise.all([
    activeCommittee(env.DB, row.committee_id),
    env.DB.prepare(
      "SELECT id FROM nl_join_requests WHERE phone=? AND status IN ('pending','referred')",
    )
      .bind(row.phone)
      .first(),
  ]);
  if (row.committee_id && !committee)
    throw integrationError(
      "اللجنة لم تعد متاحة. قدّم طلبًا جديدًا للديوان.",
      409,
    );
  if (pending)
    throw integrationError("لديك طلب انضمام قيد المراجعة بالفعل.", 409);
  const notices = await joinAdminNotices(env.DB, row, committee);
  await env.DB.batch([
    policyGuard(env.DB, row.policy_version),
    env.DB.prepare(
      "UPDATE nl_otp SET used=1 WHERE id=? AND used=0 AND expires>? AND attempts<=5",
    ).bind(otp.id, Date.now()),
    guard(env.DB),
    env.DB.prepare(
      "UPDATE nl_join_requests SET status='pending',verified_at=?,updated=?,version=version+1 WHERE id=? AND status='verifying'",
    ).bind(new Date().toISOString(), new Date().toISOString(), row.id),
    guard(env.DB),
    ...notices,
    env.DB.prepare(
      "INSERT INTO nl_audit(id,actor,action,resource,entity_id,detail,created) VALUES(?,'applicant','طلب انضمام موثق','join_requests',?,'',?)",
    ).bind(crypto.randomUUID(), row.id, new Date().toISOString()),
  ]);
  const res = reply({
    ok: true,
    message: "تم توثيق جوالك وإرسال طلب الانضمام إلى إدارة الديوان للمراجعة.",
  });
  res.headers.append("Set-Cookie", cookie("", 0));
  return res;
}
export async function joinPublicEndpoint(req, env, action) {
  try {
    if (req.method === "GET" && action === "options")
      return reply(await publicJoinOptions(env));
    if (req.method !== "POST") return reply({ error: "الطلب غير متاح" }, 405);
    ensureOrigin(req, env);
    if (!integrationStatus(env).phone)
      throw integrationError("التحقق عبر واتساب غير متاح مؤقتًا.", 503);
    if (action === "request") return await requestCode(req, env);
    if (action === "verify") return await verifyCode(req, env);
    return reply({ error: "الطلب غير متاح" }, 404);
  } catch (e) {
    if (!e.status)
      console.error("Diwan join request failed", {
        action,
        code: e.code || e.name || "unknown",
      });
    if (e.code === "23505" || /UNIQUE constraint/.test(String(e.message)))
      return reply({ error: "لديك طلب انضمام قيد المراجعة بالفعل." }, 409);
    if (e.code === "23514" || /CHECK constraint/.test(String(e.message)))
      return reply(
        { error: "تغير الطلب أو السياسة. حدّث الصفحة وأعد المحاولة." },
        409,
      );
    return reply(
      { error: e.status ? e.message : "تعذر إكمال الطلب. حاول لاحقًا." },
      e.status || 503,
    );
  }
}
