// Explicit provisioning only, never called by public requests.
import postgres from "postgres";
const email = (process.env.SITE_OWNER_EMAIL || "").trim().toLowerCase();
const phone = process.env.DIWAN_ADMIN_PHONE || "";
if (!email.includes("@") || !/^\+[1-9]\d{7,14}$/.test(phone))
  throw new Error("Admin email and international phone are required");
const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});
try {
  const users =
    await sql`SELECT id FROM auth.users WHERE lower(email)=${email}`;
  if (users.length !== 1)
    throw new Error("Expected one existing Supabase Auth administrator");
  const id = users[0].id;
  const collisions =
    await sql`SELECT id FROM nl_members WHERE phone=${phone} AND lower(coalesce(email,''))<>${email}`;
  if (collisions.length)
    throw new Error("Phone already belongs to another member");
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/admin/users/${id}`,
    {
      method: "PUT",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone }),
    },
  );
  if (!response.ok)
    throw new Error(`Auth admin phone update failed (${response.status})`);
  const grants = JSON.stringify([
    { resource: "*", action: "*", effect: "allow", scope: "all" },
  ]);
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(1748320617)`;
    await tx`INSERT INTO nl_members(id,site_id,name,email,phone,status,grants,bundles,verified,created)
      VALUES(${id},${"supabase:" + id},'مدير الديوان',${email},${phone},'active',${grants},'[]',0,${new Date().toISOString()})
      ON CONFLICT(email) DO UPDATE SET phone=excluded.phone, status='active', grants=excluded.grants,
      verified=CASE WHEN nl_members.phone=excluded.phone THEN nl_members.verified ELSE 0 END,
      version=nl_members.version+1`;
    await tx`INSERT INTO nl_audit(id,actor,action,resource,entity_id,detail,created)
      VALUES(${crypto.randomUUID()},'server-setup','configure','users',${id},'Admin linked to existing Auth account; phone awaits OTP verification',${new Date().toISOString()})`;
  });
  const [record] =
    await sql`SELECT phone=${phone} AS phone_matches, status='active' AS active, verified FROM nl_members WHERE email=${email}`;
  const [auth] =
    await sql`SELECT regexp_replace(phone,'[^0-9]','','g')=${phone.slice(1)} AS phone_matches FROM auth.users WHERE id=${id}`;
  if (!record?.phone_matches || !auth?.phone_matches)
    throw new Error("Admin phone verification failed");
  console.log(
    JSON.stringify({
      adminConfigured: true,
      authPhoneMatches: true,
      applicationPhoneMatches: true,
      phoneVerified: !!record.verified,
    }),
  );
} finally {
  await sql.end();
}
