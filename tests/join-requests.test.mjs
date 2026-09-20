import test from "node:test";
import assert from "node:assert/strict";
import { postgresTestDatabase } from "./postgres-support.mjs";
import { joinPublicEndpoint } from "../lib/join-public.js";
import { loginEndpoint } from "../lib/login.js";
import worker, { dispatchNotifications } from "../worker.js";

test("verified applications stay private until referral; decisions create login-ready members atomically", async () => {
  const DB = await postgresTestDatabase();
  const messages = [];
  const env = {
    DB,
    BUCKET: {},
    NODE_ENV: "production",
    APP_BASE_URL: "https://diwan.test",
    DIWAN_AUTH_ENABLED: "true",
    DIWAN_RUNTIME: "vercel_whatsapp",
    DIWAN_ADMIN_PHONE: "+966500000009",
    WHATSAPP_ENABLED: "true",
    WHATSAPP_PROVIDER: "green_api",
    GREEN_API_URL: "https://7107.api.greenapi.com",
    GREEN_API_INSTANCE: "1234567890",
    GREEN_API_TOKEN: "test-token-not-a-real-credential",
    OTP_SECRET: "a".repeat(48),
    PROVIDER_FETCH: async (url, opts) => {
      messages.push(JSON.parse(opts.body));
      return Response.json({ idMessage: "test-message-" + messages.length });
    },
  };
  const req = (body, cookie = "", origin = "https://diwan.test") =>
    new Request("https://diwan.test/auth/join/request", {
      method: "POST",
      headers: { origin, "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
  async function api(path, member, body) {
    const r = await worker.fetch(
      new Request("https://diwan.test/api/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          origin: "https://diwan.test",
          "content-type": "application/json",
          "oai-authenticated-user-id": member,
          "oai-authenticated-user-email": member + "@example.invalid",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { ...env, AUTHENTICATED_MEMBER_ID: member },
    );
    return { status: r.status, data: await r.json() };
  }
  const code = () => messages.at(-1).message.match(/\b\d{6}\b/)[0];
  const payload = {
    name: "Applicant Test",
    phone: "0500000001",
    reason: "Help with committee work",
    committee_id: "committee-a",
    policy_version: 0,
    consent: true,
  };
  try {
    for (const id of ["admin", "supervisor-a", "supervisor-b", "outsider"])
      await DB.prepare(
        "INSERT INTO nl_members(id,site_id,name,email,phone,status,grants,verified,created) VALUES(?,?,?,?,?,'active',?,1,?)",
      )
        .bind(
          id,
          id,
          id,
          id + "@example.invalid",
          id === "admin" ? env.DIWAN_ADMIN_PHONE : null,
          JSON.stringify(
            id === "admin"
              ? [{ resource: "*", action: "*", effect: "allow", scope: "all" }]
              : [],
          ),
          new Date().toISOString(),
        )
        .run();
    const empty = await joinPublicEndpoint(
      new Request("https://diwan.test/auth/join/options"),
      env,
      "options",
    );
    assert.deepEqual((await empty.json()).committees, []);
    await DB.prepare(
      "INSERT INTO nl_projects(id,title,created_by,created) VALUES('project','Test','admin',?)",
    )
      .bind(new Date().toISOString())
      .run();
    for (const [id, supervisor] of [
      ["committee-a", "supervisor-a"],
      ["committee-b", "supervisor-b"],
    ])
      await DB.prepare(
        "INSERT INTO nl_committees(id,project_id,name,members,statuses,created_by,created) VALUES(?,'project',?,?,'[]','admin',?)",
      )
        .bind(
          id,
          id,
          JSON.stringify([{ id: supervisor, role: "supervisor", grants: [] }]),
          new Date().toISOString(),
        )
        .run();
    assert.equal(
      (
        await joinPublicEndpoint(
          req({ ...payload, consent: false }),
          env,
          "request",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await joinPublicEndpoint(
          req(payload, "", "https://evil.invalid"),
          env,
          "request",
        )
      ).status,
      403,
    );
    const start = await joinPublicEndpoint(req(payload), env, "request");
    assert.equal(start.status, 200);
    const cookie = start.headers.get("set-cookie").split(";")[0],
      challenge = (await start.json()).challenge_id,
      otp = code();
    assert.equal((await api("join-requests", "admin")).data.requests.length, 0);
    assert.equal(
      (
        await joinPublicEndpoint(
          req({ challenge_id: challenge, code: otp }),
          env,
          "verify",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await joinPublicEndpoint(
          req({ challenge_id: challenge, code: otp }, cookie),
          env,
          "verify",
        )
      ).status,
      200,
    );
    assert.equal(
      await DB.prepare(
        "SELECT id FROM nl_members WHERE phone='+966500000001'",
      ).first(),
      null,
    );
    let list = (await api("join-requests", "admin")).data.requests;
    assert.equal(list.length, 1);
    let application = list[0];
    assert.equal(application.phone, "+966500000001");
    assert.equal(
      (await api("join-requests", "supervisor-a")).data.requests.length,
      0,
    );
    assert.equal(
      (
        await api("join-requests/decide", "supervisor-a", {
          id: application.id,
          version: application.version,
          decision: "approve",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await api("join-requests/forward", "admin", {
          id: application.id,
          version: application.version,
          supervisor_id: "supervisor-b",
        })
      ).status,
      400,
    );
    const beforeNotice = messages.length;
    assert.equal((await dispatchNotifications(env)).accepted, 1);
    assert.equal(messages.length, beforeNotice + 1);
    assert.equal(
      messages.at(-1).message,
      "يوجد طلب انضمام للجنة committee-a بانتظار ردكم.",
    );
    assert.ok(!messages.at(-1).message.includes(payload.name));
    assert.equal((await dispatchNotifications(env)).accepted, 0);
    assert.equal(
      (
        await api("join-requests/forward", "admin", {
          id: application.id,
          version: application.version,
          supervisor_id: "supervisor-a",
        })
      ).status,
      200,
    );
    application = (await api("join-requests", "supervisor-a")).data.requests[0];
    assert.equal(application.can_decide, true);
    assert.equal(
      (await api("join-requests", "supervisor-b")).data.requests.length,
      0,
    );
    await DB.prepare(
      "UPDATE nl_committees SET members='[]',version=version+1 WHERE id='committee-a'",
    ).run();
    assert.equal(
      (
        await api("join-requests/decide", "supervisor-a", {
          id: application.id,
          version: application.version,
          decision: "approve",
        })
      ).status,
      404,
    );
    await DB.prepare(
      "UPDATE nl_committees SET members=?,version=version+1 WHERE id='committee-a'",
    )
      .bind(
        JSON.stringify([
          { id: "supervisor-a", role: "supervisor", grants: [] },
        ]),
      )
      .run();
    const decision = await api("join-requests/decide", "supervisor-a", {
      id: application.id,
      version: application.version,
      decision: "approve",
    });
    assert.equal(decision.status, 200, JSON.stringify(decision));
    const member = await DB.prepare("SELECT * FROM nl_members WHERE id=?")
      .bind(decision.data.member_id)
      .first();
    assert.equal(member.name, payload.name);
    assert.equal(member.phone, "+966500000001");
    assert.equal(member.verified, 1);
    assert.equal(member.status, "active");
    assert.equal(member.grants, "[]");
    const committee = await DB.prepare(
      "SELECT members FROM nl_committees WHERE id='committee-a'",
    ).first();
    assert.equal(
      JSON.parse(committee.members).find((m) => m.id === member.id).role,
      "member",
    );
    assert.equal(
      (
        await api("join-requests/decide", "supervisor-a", {
          id: application.id,
          version: application.version,
          decision: "approve",
        })
      ).status,
      409,
    );
    // New accounts authenticate with the existing WhatsApp login, without Sites ids.
    const login = await loginEndpoint(
      req({ phone: member.phone, consent: true }),
      env,
      "request",
    );
    assert.equal(login.status, 200);
    const loginVerify = await loginEndpoint(
      req(
        { challenge_id: (await login.json()).challenge_id, code: code() },
        login.headers.get("set-cookie").split(";")[0],
      ),
      env,
      "verify",
    );
    assert.equal(loginVerify.status, 200);
    assert.equal(
      (await api("auth/status", member.id)).data.account.verified,
      true,
    );
    assert.equal((await api("state", member.id)).status, 200);
    // Direct Diwan requests are never routed to a committee supervisor.
    const direct = await joinPublicEndpoint(
      req({ ...payload, phone: "0500000002", committee_id: null }),
      env,
      "request",
    );
    const dc = direct.headers.get("set-cookie").split(";")[0];
    const did = (await direct.json()).challenge_id;
    assert.equal(
      (
        await joinPublicEndpoint(
          req({ challenge_id: did, code: code() }, dc),
          env,
          "verify",
        )
      ).status,
      200,
    );
    const dr = (await api("join-requests", "admin")).data.requests.find(
      (r) => r.committee_id === null,
    );
    assert.equal(
      (
        await api("join-requests/forward", "admin", {
          id: dr.id,
          version: dr.version,
          supervisor_id: "supervisor-a",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api("join-requests/decide", "admin", {
          id: dr.id,
          version: dr.version,
          decision: "reject",
        })
      ).status,
      200,
    );
    assert.equal(
      await DB.prepare(
        "SELECT id FROM nl_members WHERE phone='+966500000002'",
      ).first(),
      null,
    );
    // Terms are versioned, with consent checked again before final submission.
    assert.equal(
      (
        await api("join-policy/save", "supervisor-a", {
          title: "Terms",
          content: "Updated policy",
          version: 0,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api("join-policy/save", "admin", {
          title: "Terms",
          content: "Updated policy",
          version: 0,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await joinPublicEndpoint(
          req({ ...payload, phone: "0500000003" }),
          env,
          "request",
        )
      ).status,
      409,
    );
    const security = await DB.prepare(
      "SELECT relrowsecurity AS rls FROM pg_class WHERE relname='nl_join_requests'",
    ).first();
    assert.equal(security.rls, true);
    assert.equal(
      (
        await DB.prepare(
          "SELECT count(*) AS n FROM information_schema.role_table_grants WHERE table_name='nl_join_requests' AND grantee IN ('anon','authenticated')",
        ).first()
      ).n,
      0,
    );
  } finally {
    await DB.close();
  }
});
