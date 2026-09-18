import { parse } from "./domain.js";
import { boundedBody, httpsOrigin } from "./security.js";
export const integrationError = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export const rows = async (db, sql, ...args) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
export const row = (db, sql, ...args) =>
  db
    .prepare(sql)
    .bind(...args)
    .first();
export const stamp = () => new Date().toISOString();
export function integrationStatus(env) {
  const ready = (keys) =>
    keys.every((k) => typeof env[k] === "string" && env[k].trim());
  const ai =
    env.AI_ENABLED === "true" && ready(["OPENAI_API_KEY", "OPENAI_MODEL"]);
  const wa =
    env.WHATSAPP_ENABLED === "true" &&
    ready(["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_API_VERSION"]) &&
    /^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION) &&
    /^\d+$/.test(env.WHATSAPP_PHONE_ID);
  return {
    ai,
    whatsapp:
      wa &&
      ready(["WHATSAPP_NOTIFICATION_TEMPLATE"]) &&
      !!httpsOrigin(env.APP_BASE_URL),
    phone:
      wa &&
      ready(["WHATSAPP_OTP_TEMPLATE", "OTP_SECRET"]) &&
      env.OTP_SECRET.length >= 32,
    voice: ai && ready(["OPENAI_TRANSCRIBE_MODEL"]),
    uploads: true,
    webhook: ready(["WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]),
    mode: "sites_private",
    ai_status: ai ? "configured" : "awaiting_configuration",
    whatsapp_status: wa ? "configured" : "awaiting_configuration",
  };
}
export async function limit(db, key, max, seconds) {
  const now = Date.now();
  const r = await db
    .prepare(
      `INSERT INTO nl_integration_limits(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires<? THEN 1 ELSE hits+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING hits`,
    )
    .bind(key, now + seconds * 1000, now, now)
    .first();
  if (r.hits > max)
    throw integrationError("وصلت للحد المؤقت للاستخدام. حاول لاحقًا.", 429);
}
export async function providerFetch(env, url, options) {
  try {
    return await (env.PROVIDER_FETCH || fetch)(url, {
      ...options,
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw integrationError(
      "تعذر تأكيد استجابة مزود الخدمة. لم نعرض العملية على أنها مكتملة.",
      502,
    );
  }
}
export async function openai(env, body) {
  if (!integrationStatus(env).ai)
    throw integrationError(
      "سَنَد جاهز للربط. أضف إعدادات خدمة الذكاء الاصطناعي لتفعيل المحادثة والتحليل.",
      503,
    );
  const r = await providerFetch(env, "https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      store: false,
      include: ["reasoning.encrypted_content"],
      max_output_tokens: 3000,
      ...body,
    }),
  });
  if (!r.ok)
    throw integrationError(
      r.status === 429
        ? "مزود الذكاء الاصطناعي بلغ حد الاستخدام. يمكنك استكمال النموذج يدويًا."
        : "تعذر تشغيل سَنَد لدى المزود. جرّب لاحقًا.",
      r.status === 429 ? 429 : 502,
    );
  const d = await r.json();
  if (d.status === "incomplete" || d.error)
    throw integrationError("لم تكتمل إجابة سَنَد. حاول تقليل الطلب.", 502);
  return d;
}
export const responseText = (d) =>
  (d.output || [])
    .filter((x) => x.type === "message")
    .flatMap((x) => x.content || [])
    .filter((x) => x.type === "output_text")
    .map((x) => x.text)
    .join("\n");
export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function whatsapp(env, phone, template, parameters, otp = false) {
  if (
    !env.WHATSAPP_TOKEN ||
    !/^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION || "") ||
    !/^\d+$/.test(env.WHATSAPP_PHONE_ID || "")
  )
    throw integrationError("إعدادات واتساب غير مكتملة.", 503);
  const components = [
    {
      type: "body",
      parameters: parameters.map((text) => ({
        type: "text",
        text: String(text),
      })),
    },
  ];
  if (otp)
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: String(parameters[0]) }],
    });
  const r = await providerFetch(
    env,
    `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace("+", ""),
        type: "template",
        template: {
          name: template,
          language: { code: env.WHATSAPP_LANGUAGE || "ar" },
          components,
        },
      }),
    },
  );
  if (!r.ok) {
    const e = integrationError(
      r.status === 429
        ? "واتساب بلغ حد الإرسال المؤقت."
        : "رفض مزود واتساب الطلب. راجع القالب وإعدادات الرقم.",
      502,
    );
    e.retryable = r.status === 429;
    throw e;
  }
  const d = await r.json();
  if (!d.messages?.[0]?.id)
    throw integrationError("لم يؤكد واتساب قبول الرسالة.", 502);
  return d.messages[0].id;
}
export async function requestOtp(req, env, b) {
  const site = req.headers.get("oai-authenticated-user-id");
  if (!site) throw integrationError("ادخل إلى النسخة الخاصة أولًا.", 401);
  if (!integrationStatus(env).phone)
    throw integrationError(
      "التحقق بالجوال جاهز للربط بواتساب؛ لم يُرسل رمز بعد.",
      503,
    );
  const phone = String(b.phone || "").replace(/[\s-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw integrationError("أدخل الجوال مع رمز الدولة.");
  if (b.consent !== true)
    throw integrationError("وافق على استلام رمز التحقق عبر واتساب.");
  await limit(env.DB, "otp:identity:" + site, 1, 60);
  await limit(env.DB, "otp:phone:" + phone, 8, 3600);
  const id = crypto.randomUUID(),
    rnd = new Uint32Array(1);
  let n;
  do {
    crypto.getRandomValues(rnd);
    n = rnd[0];
  } while (n >= 4294000000);
  const code = String(n % 1000000).padStart(6, "0");
  const hash = await hmac(
      env.OTP_SECRET,
      id + "|" + site + "|" + phone + "|" + code,
    ),
    now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE nl_otp SET used=1 WHERE site_id=? AND used=0").bind(
      site,
    ),
    env.DB.prepare(
      "INSERT INTO nl_otp(id,site_id,phone,hash,expires,created) VALUES(?,?,?,?,?,?)",
    ).bind(id, site, phone, hash, now + 300000, now),
  ]);
  try {
    await whatsapp(env, phone, env.WHATSAPP_OTP_TEMPLATE, [code], true);
    await env.DB.prepare("UPDATE nl_otp SET status='sent' WHERE id=?")
      .bind(id)
      .run();
  } catch (e) {
    await env.DB.prepare("UPDATE nl_otp SET used=1,status='failed' WHERE id=?")
      .bind(id)
      .run();
    throw e;
  }
  return {
    challenge_id: id,
    expires_in: 300,
    retry_after: 60,
    message: "قُبل إرسال رمز التحقق إلى واتساب.",
  };
}
export async function verifyOtp(req, env, b) {
  const site = req.headers.get("oai-authenticated-user-id");
  if (!site) throw integrationError("ادخل إلى النسخة الخاصة أولًا.", 401);
  if (!integrationStatus(env).phone)
    throw integrationError("التحقق بالجوال بانتظار الربط.", 503);
  const c = await env.DB.prepare(
    "UPDATE nl_otp SET attempts=attempts+1 WHERE id=? AND site_id=? AND used=0 AND status='sent' AND expires>? AND attempts<5 RETURNING *",
  )
    .bind(String(b.challenge_id || ""), site, Date.now())
    .first();
  if (
    !c ||
    !/^\d{6}$/.test(String(b.code || "")) ||
    !equal(
      c.hash,
      await hmac(
        env.OTP_SECRET,
        c.id + "|" + site + "|" + c.phone + "|" + b.code,
      ),
    )
  )
    throw integrationError("الرمز غير صحيح أو انتهت صلاحيته.");
  const existing = await row(
      env.DB,
      "SELECT * FROM nl_members WHERE site_id=?",
      site,
    ),
    other = await row(
      env.DB,
      "SELECT * FROM nl_members WHERE phone=?",
      c.phone,
    );
  const prepared =
    other && !other.site_id && (!existing || existing.id === other.id)
      ? other
      : null;
  if (other && other.id !== existing?.id && !prepared)
    throw integrationError("الرقم مرتبط بحساب آخر؛ راجع إدارة الديوان.", 409);
  const member = existing || prepared;
  const id = member?.id || crypto.randomUUID(),
    name = String(member?.name || b.name || "")
      .trim()
      .slice(0, 150),
    status =
      member?.status === "invited" ? "pending" : member?.status || "pending";
  if (!name) throw integrationError("اكتب الاسم لإكمال طلب الانضمام.");
  const consume = await env.DB.prepare(
    "UPDATE nl_otp SET used=1 WHERE id=? AND used=0 RETURNING id",
  )
    .bind(c.id)
    .first();
  if (!consume) throw integrationError("استُخدم هذا الرمز بالفعل.", 409);
  await env.DB.batch([
    member
      ? env.DB.prepare(
          "UPDATE nl_members SET site_id=?,phone=?,verified=1,status=?,version=version+1 WHERE id=? AND (site_id IS NULL OR site_id=?) AND version=?",
        ).bind(site, c.phone, status, id, site, member.version)
      : env.DB.prepare(
          "INSERT INTO nl_members(id,site_id,name,phone,status,grants,bundles,verified,created) VALUES(?,?,?,?,'pending','[]','[]',1,?)",
        ).bind(id, site, name, c.phone, stamp()),
    env.DB.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind(
      crypto.randomUUID(),
    ),
    env.DB.prepare(
      "INSERT INTO nl_contact_preferences(member_id,whatsapp,consent_at) VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET whatsapp=excluded.whatsapp,consent_at=excluded.consent_at",
    ).bind(id, b.notifications === true ? 1 : 0, stamp()),
  ]);
  return {
    verified: true,
    status,
    message:
      status === "active"
        ? "تم توثيق الجوال."
        : "تم توثيق الجوال. طلب الانضمام بانتظار موافقة الأدمن وتحديد صلاحياتك.",
  };
}
export async function webhook(req, env) {
  const u = new URL(req.url);
  if (req.method === "GET") {
    if (
      env.WHATSAPP_VERIFY_TOKEN &&
      equal(
        u.searchParams.get("hub.verify_token"),
        env.WHATSAPP_VERIFY_TOKEN,
      ) &&
      u.searchParams.get("hub.mode") === "subscribe"
    )
      return new Response(u.searchParams.get("hub.challenge"));
    throw integrationError("غير مصرح", 403);
  }
  if (req.method !== "POST") throw integrationError("الطريقة غير متاحة", 405);
  const raw = new TextDecoder().decode(await boundedBody(req, 1048576));
  if (
    !env.WHATSAPP_APP_SECRET ||
    !equal(
      req.headers.get("x-hub-signature-256"),
      "sha256=" + (await hmac(env.WHATSAPP_APP_SECRET, raw)),
    )
  )
    throw integrationError("توقيع غير صحيح", 403);
  const b = JSON.parse(raw);
  for (const e of b.entry || [])
    for (const c of e.changes || [])
      for (const s of c.value?.statuses || []) {
        const rank = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 },
          old = await row(
            env.DB,
            "SELECT * FROM nl_delivery_jobs WHERE provider_id=?",
            s.id,
          );
        if (
          old &&
          rank[s.status] !== undefined &&
          rank[s.status] >= (rank[old.status] ?? 0)
        )
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE nl_delivery_jobs SET status=?,updated=? WHERE id=? AND (CASE status WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END)<=? AND NOT (?='failed' AND status IN ('delivered','read'))",
            ).bind(s.status, stamp(), old.id, rank[s.status], s.status),
            env.DB.prepare(
              "UPDATE nl_notifications SET status=(SELECT status FROM nl_delivery_jobs WHERE id=?) WHERE id=?",
            ).bind(old.id, old.id),
          ]);
      }
  return new Response("OK");
}
