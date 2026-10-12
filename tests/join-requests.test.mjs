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
    for (const id of [
      "admin",
      "manager-a",
      "manager-b",
      "standalone-supervisor",
      "outsider",
    ])
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
    for (const [id, manager] of [
      ["committee-a", "manager-a"],
      ["committee-b", "manager-b"],
    ])
      await DB.prepare(
        "INSERT INTO nl_committees(id,project_id,name,manager_id,members,statuses,created_by,created) VALUES(?,'project',?,?,?,'[]','admin',?)",
      )
        .bind(
          id,
          id,
          manager,
          JSON.stringify([
            { id: manager, role: "member", grants: [] },
            { id: "standalone-supervisor", role: "supervisor", grants: [] },
          ]),
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
    const routing = (await api("join-requests", "admin")).data.supervisors;
    assert.deepEqual(
      routing.filter((m) => m.committee_id === "committee-a").map((m) => m.id),
      ["manager-a"],
    );
    assert.equal(
      (await api("state", "standalone-supervisor")).data.join_requests_access,
      false,
    );
    assert.equal(
      (await api("join-requests", "manager-a")).data.requests.length,
      0,
    );
    assert.equal(
      (
        await api("join-requests/decide", "manager-a", {
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
          supervisor_id: "manager-b",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api("join-requests/forward", "admin", {
          id: application.id,
          version: application.version,
          supervisor_id: "standalone-supervisor",
        })
      ).status,
      400,
      "a same-committee legacy supervisor cannot replace the manager",
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
        })
      ).status,
      200,
    );
    application = (await api("join-requests", "manager-a")).data.requests[0];
    assert.equal(application.can_decide, true);
    assert.equal(
      (await api("join-requests", "manager-b")).data.requests.length,
      0,
    );
    // A legacy supervisor label is not a referral authority, even if a stale
    // database row had been assigned to that person before the migration.
    await DB.prepare(
      "UPDATE nl_join_requests SET assigned_to='standalone-supervisor' WHERE id=?",
    )
      .bind(application.id)
      .run();
    assert.equal(
      (await api("join-requests", "standalone-supervisor")).data.requests
        .length,
      0,
    );
    assert.equal(
      (
        await api("join-requests/decide", "standalone-supervisor", {
          id: application.id,
          version: application.version,
          decision: "approve",
        })
      ).status,
      404,
    );
    await DB.prepare(
      "UPDATE nl_join_requests SET assigned_to='manager-a' WHERE id=?",
    )
      .bind(application.id)
      .run();
    // Assignment and current leadership must both match. Changing the manager
    // cannot expose the old referral to either person until an admin re-refers it.
    await DB.prepare(
      "UPDATE nl_committees SET manager_id='manager-b',members=?,version=version+1 WHERE id='committee-a'",
    )
      .bind(
        JSON.stringify([
          { id: "manager-a", role: "supervisor", grants: [] },
          { id: "manager-b", role: "member", grants: [] },
        ]),
      )
      .run();
    for (const actor of ["manager-a", "manager-b"])
      assert.equal(
        (
          await api("join-requests/decide", actor, {
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
        })
      ).status,
      200,
    );
    application = (await api("join-requests", "manager-b")).data.requests[0];
    assert.equal(application.assigned_to, "manager-b");
    assert.equal(
      (await api("join-requests", "manager-a")).data.requests.length,
      0,
    );
    // Deny overrides derived manager authority; expired deny no longer applies.
    await DB.prepare("UPDATE nl_members SET grants=? WHERE id='manager-b'")
      .bind(
        JSON.stringify([
          {
            resource: "join_requests",
            action: "approve",
            effect: "deny",
            scope: "all",
          },
        ]),
      )
      .run();
    assert.equal(
      (
        await api("join-requests/decide", "manager-b", {
          id: application.id,
          version: application.version,
          decision: "approve",
        })
      ).status,
      403,
    );
    assert.equal(
      await DB.prepare(
        "SELECT id FROM nl_members WHERE phone='+966500000001'",
      ).first(),
      null,
    );
    assert.equal(
      (
        await DB.prepare("SELECT status FROM nl_join_requests WHERE id=?")
          .bind(application.id)
          .first()
      ).status,
      "referred",
    );
    await DB.prepare("UPDATE nl_members SET grants=? WHERE id='manager-b'")
      .bind(
        JSON.stringify([
          {
            resource: "join_requests",
            action: "approve",
            effect: "deny",
            scope: "all",
            expires: "2000-01-01T00:00:00Z",
          },
        ]),
      )
      .run();
    const decision = await api("join-requests/decide", "manager-b", {
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
        await api("join-requests/decide", "manager-b", {
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
    // Direct Diwan requests are never routed to a committee manager.
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
        await api("join-policy/save", "manager-a", {
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
