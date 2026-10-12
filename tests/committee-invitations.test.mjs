import test from "node:test";
import assert from "node:assert/strict";
import { app, addProject, addMember } from "./support.mjs";
import { dispatchNotifications } from "../worker.js";
import { loginEndpoint, sessionMember } from "../lib/login.js";

process.env.DIWAN_TEST_DATABASE = "postgres";

export function configureInvitations(a) {
  const messages = [];
  Object.assign(a.env, {
    NODE_ENV: "production",
    APP_BASE_URL: "https://diwan.test",
    DIWAN_AUTH_ENABLED: "true",
    WHATSAPP_ENABLED: "true",
    WHATSAPP_PROVIDER: "green_api",
    GREEN_API_URL: "https://7107.api.greenapi.com",
    GREEN_API_INSTANCE: "1234567890",
    GREEN_API_TOKEN: "test-token-not-a-real-credential",
    OTP_SECRET: "a".repeat(48),
    PROVIDER_FETCH: async (_, opts) => {
      messages.push(JSON.parse(opts.body));
      return Response.json({ idMessage: "test-" + messages.length });
    },
  });
  return messages;
}
const saveBody = (project_id, phone = "0500000001") => ({
  project_id,
  name: "لجنة اختبار",
  description: "",
  members: [],
  manager_new: { name: "مدير تجريبي", phone },
});
const login = (a, phone, code, origin = "https://diwan.test") =>
  loginEndpoint(
    new Request("https://diwan.test/auth/otp/invitation", {
      method: "POST",
      headers: {
        origin,
        "Content-Type": "application/json",
        "x-forwarded-for": "192.0.2.10",
      },
      body: JSON.stringify({ phone, code }),
    }),
    a.env,
    "invitation",
  );

test("manager creation is atomic, optional email, scoped, idempotent and delivers no plaintext credential to storage", async () => {
  const a = await app(),
    messages = configureInvitations(a),
    pid = await addProject(a);
  const body = saveBody(pid);
  const saved = await a.req("committees/save", body, undefined, {
    key: "manager-create",
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.manager_invitation, "accepted");
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /لجنة اختبار.*مشروع اختبار/s);
  assert.match(messages[0].message, /مهامك/);
  const code = messages[0].message.match(/\b[A-F0-9]{12}\b/)[0];
  const m = await a.DB.prepare(
    "SELECT * FROM nl_members WHERE phone='+966500000001'",
  ).first();
  assert.equal(m.email, null);
  assert.equal(m.verified, 0);
  assert.equal(m.grants, "[]");
  const committee = await a.DB.prepare("SELECT * FROM nl_committees WHERE id=?")
    .bind(saved.data.id)
    .first();
  assert.equal(committee.manager_id, m.id);
  assert.equal(JSON.parse(committee.members)[0].role, "manager");
  for (const table of ["nl_otp", "nl_notifications", "nl_receipts", "nl_audit"])
    assert.ok(
      !JSON.stringify(
        (await a.DB.prepare(`SELECT * FROM ${table}`).all()).results,
      ).includes(code),
      table,
    );
  const replay = await a.req("committees/save", body, undefined, {
    key: "manager-create",
  });
  assert.equal(replay.status, 200, JSON.stringify(replay.data));
  assert.equal(messages.length, 1);
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 1);
  assert.equal(
    (await login(a, m.phone, code, "https://evil.test")).status,
    403,
  );
  assert.equal((await login(a, m.phone, "000000000000")).status, 400);
  const signedIn = await login(a, m.phone, code);
  assert.equal(signedIn.status, 200, await signedIn.clone().text());
  const cookie = signedIn.headers.getSetCookie()[0].split(";")[0];
  assert.equal(
    (
      await sessionMember(
        new Request("https://diwan.test", { headers: { cookie } }),
        a.env,
      )
    ).id,
    m.id,
  );
  assert.equal((await login(a, m.phone, code)).status, 400);
  const stale = await a.req("committees/save", {
    ...saveBody(pid, "0500000002"),
    id: committee.id,
    version: 0,
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(
    await a.DB.prepare(
      "SELECT id FROM nl_members WHERE phone='+966500000002'",
    ).first(),
    null,
  );
  assert.equal(messages.length, 1);
});

test("manager invitations validate authority, phones, email, existing members and delivery failure", async () => {
  const a = await app(),
    messages = configureInvitations(a),
    pid = await addProject(a);
  const restricted = await addMember(a, "restricted", [
    { resource: "committees", action: "create", scope: "all", effect: "allow" },
  ]);
  assert.equal(
    (await a.req("committees/save", saveBody(pid), restricted)).status,
    403,
  );
  for (const manager_new of [
    { name: "test", phone: "bad" },
    { name: "test", phone: "0500000001", email: "bad" },
  ])
    assert.equal(
      (await a.req("committees/save", { ...saveBody(pid), manager_new }))
        .status,
      400,
    );
  a.env.PROVIDER_FETCH = async () => {
    throw new Error("uncertain network failure");
  };
  const first = await a.req("committees/save", saveBody(pid));
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.manager_invitation, "needs_review");
  const member = await a.DB.prepare(
    "SELECT * FROM nl_members WHERE phone='+966500000001'",
  ).first();
  configureInvitations(a);
  const second = await a.req("committees/save", {
    ...saveBody(pid),
    name: "لجنة أخرى",
  });
  assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.equal(
    (
      await a.DB.prepare("SELECT * FROM nl_committees WHERE id=?")
        .bind(second.data.id)
        .first()
    ).manager_id,
    member.id,
  );
  assert.equal(
    (
      await a.DB.prepare(
        "SELECT COUNT(*) AS count FROM nl_members WHERE phone=?",
      )
        .bind(member.phone)
        .first()
    ).count,
    1,
  );
  await a.DB.prepare("UPDATE nl_members SET status='suspended' WHERE id=?")
    .bind(member.id)
    .run();
  assert.equal((await a.req("committees/save", saveBody(pid))).status, 400);
  assert.equal(messages.length, 0);
});

test("temporary manager passwords reject expiry, removal, changed phone, closed project and lock after five attempts", async () => {
  for (const scenario of [
    "expired",
    "removed",
    "phone",
    "closed",
    "attempts",
    "deny",
  ]) {
    const a = await app(),
      messages = configureInvitations(a),
      pid = await addProject(a);
    const saved = await a.req("committees/save", saveBody(pid));
    assert.equal(
      saved.data.manager_invitation,
      "accepted",
      JSON.stringify(saved.data),
    );
    const code = messages[0].message.match(/\b[A-F0-9]{12}\b/)[0];
    if (scenario === "expired")
      await a.DB.prepare("UPDATE nl_otp SET expires=0").run();
    if (scenario === "removed")
      await a.DB.prepare("UPDATE nl_committees SET manager_id=NULL WHERE id=?")
        .bind(saved.data.id)
        .run();
    if (scenario === "phone")
      await a.DB.prepare(
        "UPDATE nl_members SET phone='+966500000002' WHERE phone='+966500000001'",
      ).run();
    if (scenario === "closed")
      await a.DB.prepare("UPDATE nl_projects SET status='closed' WHERE id=?")
        .bind(pid)
        .run();
    if (scenario === "deny")
      await a.DB.prepare(
        "UPDATE nl_members SET grants=? WHERE phone='+966500000001'",
      )
        .bind(
          JSON.stringify([
            {
              resource: "committees",
              action: "view",
              scope: "all",
              effect: "deny",
            },
          ]),
        )
        .run();
    if (scenario === "attempts")
      for (let i = 0; i < 5; i++)
        assert.equal(
          (await login(a, "0500000001", "000000000000")).status,
          400,
        );
    assert.equal((await login(a, "0500000001", code)).status, 400, scenario);
  }
});
