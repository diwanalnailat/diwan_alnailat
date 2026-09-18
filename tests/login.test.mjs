import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { postgresTestDatabase } from "./postgres-support.mjs";
import {
  loginEndpoint,
  sessionMember,
  normalizeLoginPhone,
  SESSION_COOKIE,
} from "../lib/login.js";
import worker from "../worker.js";
const phone = "+966500000001";
function request(body, cookies = "", origin = "https://diwan.test") {
  return new Request("https://diwan.test/auth/otp/request", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      cookie: cookies,
      "x-forwarded-for": "192.0.2.1",
    },
    body: JSON.stringify(body),
  });
}
test("WhatsApp OTP sessions enforce browser binding, one-time use, revocation and current permissions", async () => {
  const DB = await postgresTestDatabase();
  let sentCode = "",
    sends = 0;
  const env = {
    DB,
    BUCKET: {},
    NODE_ENV: "production",
    APP_BASE_URL: "https://diwan.test",
    DIWAN_AUTH_ENABLED: "true",
    WHATSAPP_ENABLED: "true",
    WHATSAPP_PROVIDER: "green_api",
    GREEN_API_URL: "https://7107.api.greenapi.com",
    GREEN_API_INSTANCE: "1234567890",
    GREEN_API_TOKEN: "test-token-not-a-real-credential",
    OTP_SECRET: "a".repeat(48),
    PROVIDER_FETCH: async (url, options) => {
      sends++;
      sentCode = JSON.parse(options.body).message.match(/\b\d{6}\b/)[0];
      return Response.json({ idMessage: "test-id" });
    },
  };
  try {
    await DB.prepare(
      "INSERT INTO nl_members(id,site_id,name,email,phone,status,grants,created) VALUES('login-test','auth-login-test','Test','test@example.invalid',?,'active',?,?)",
    )
      .bind(
        phone,
        JSON.stringify([
          { resource: "*", action: "*", effect: "allow", scope: "all" },
        ]),
        new Date().toISOString(),
      )
      .run();
    assert.equal(normalizeLoginPhone("0500000001"), phone);
    assert.equal(
      (
        await loginEndpoint(
          request({ phone, consent: true }, "", "https://evil.invalid"),
          env,
          "request",
        )
      ).status,
      403,
    );
    const start = await loginEndpoint(
      request({ phone, consent: true }),
      env,
      "request",
    );
    assert.equal(start.status, 200);
    assert.equal(sends, 1);
    const challenge = await start.json();
    const binding = start.headers.getSetCookie()[0].split(";")[0];
    const stored = await DB.prepare("SELECT * FROM nl_otp WHERE id=?")
      .bind(challenge.challenge_id)
      .first();
    assert.notEqual(stored.hash, sentCode);
    assert.equal(stored.hash.length, 64);
    assert.equal(
      (
        await loginEndpoint(
          request({ phone, consent: true }, binding),
          env,
          "request",
        )
      ).status,
      429,
    );
    assert.equal(
      (
        await loginEndpoint(
          request({ challenge_id: challenge.challenge_id, code: sentCode }),
          env,
          "verify",
        )
      ).status,
      400,
    );
    const wrong = sentCode === "000000" ? "111111" : "000000";
    assert.equal(
      (
        await loginEndpoint(
          request(
            { challenge_id: challenge.challenge_id, code: wrong },
            binding,
          ),
          env,
          "verify",
        )
      ).status,
      400,
    );
    const verified = await loginEndpoint(
      request(
        { challenge_id: challenge.challenge_id, code: sentCode },
        binding,
      ),
      env,
      "verify",
    );
    assert.equal(verified.status, 200);
    const set = verified.headers
      .getSetCookie()
      .find((x) => x.startsWith(SESSION_COOKIE + "="));
    assert.match(set, /HttpOnly/);
    assert.match(set, /Secure/);
    assert.match(set, /SameSite=Lax/);
    const session = set.split(";")[0];
    const authenticated = new Request("https://diwan.test/api/state", {
      headers: { cookie: session },
    });
    const member = await sessionMember(authenticated, env);
    assert.equal(member.id, "login-test");
    assert.equal(member.verified, 1);
    assert.equal(
      (
        await loginEndpoint(
          request(
            { challenge_id: challenge.challenge_id, code: sentCode },
            binding,
          ),
          env,
          "verify",
        )
      ).status,
      400,
    );
    const state = await worker.fetch(
      new Request("https://diwan.test/api/state", {
        headers: {
          "oai-authenticated-user-id": "auth-login-test",
          "oai-authenticated-user-email": "test@example.invalid",
        },
      }),
      { ...env, AUTHENTICATED_MEMBER_ID: member.id },
    );
    assert.equal(state.status, 200);
    await DB.prepare(
      "UPDATE nl_members SET status='suspended' WHERE id='login-test'",
    ).run();
    assert.equal(await sessionMember(authenticated, env), null);
    await DB.prepare(
      "UPDATE nl_members SET status='active',phone='+966500000002' WHERE id='login-test'",
    ).run();
    assert.equal(await sessionMember(authenticated, env), null);
    await DB.prepare("UPDATE nl_members SET phone=? WHERE id='login-test'")
      .bind(phone)
      .run();
    const loggedOut = await loginEndpoint(request({}, session), env, "logout");
    assert.equal(loggedOut.status, 303);
    assert.equal(await sessionMember(authenticated, env), null);
    // Fresh challenge, then exhaust five attempts: correct code must no longer work.
    await DB.prepare("DELETE FROM nl_integration_limits").run();
    const next = await loginEndpoint(
      request({ phone, consent: true }),
      env,
      "request",
    );
    const nextBody = await next.json();
    const nextBinding = next.headers.getSetCookie()[0].split(";")[0];
    const wrongAgain = sentCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await loginEndpoint(
            request(
              { challenge_id: nextBody.challenge_id, code: wrongAgain },
              nextBinding,
            ),
            env,
            "verify",
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await loginEndpoint(
          request(
            { challenge_id: nextBody.challenge_id, code: sentCode },
            nextBinding,
          ),
          env,
          "verify",
        )
      ).status,
      400,
    );
    await DB.prepare("DELETE FROM nl_integration_limits").run();
    const exp = await loginEndpoint(
      request({ phone, consent: true }),
      env,
      "request",
    );
    const expBody = await exp.json();
    const expBinding = exp.headers.getSetCookie()[0].split(";")[0];
    await DB.prepare("UPDATE nl_otp SET expires=0 WHERE id=?")
      .bind(expBody.challenge_id)
      .run();
    assert.equal(
      (
        await loginEndpoint(
          request(
            { challenge_id: expBody.challenge_id, code: sentCode },
            expBinding,
          ),
          env,
          "verify",
        )
      ).status,
      400,
    );
    await DB.prepare("DELETE FROM nl_integration_limits").run();
    const before = sends;
    const unknown = await loginEndpoint(
      request({ phone: "+966500000099", consent: true }),
      env,
      "request",
    );
    assert.equal(unknown.status, 200);
    assert.equal(sends, before);
    assert.equal((await unknown.json()).message, challenge.message);
    // A standalone expired session is denied regardless of valid token formatting.
    const token = "b".repeat(64);
    await DB.prepare(
      "INSERT INTO nl_sessions(hash,member_id,phone,expires,created) VALUES(?,'login-test',?,0,0)",
    )
      .bind(createHash("sha256").update(token).digest("hex"), phone)
      .run();
    assert.equal(
      await sessionMember(
        new Request("https://diwan.test", {
          headers: { cookie: SESSION_COOKIE + "=" + token },
        }),
        env,
      ),
      null,
    );
  } finally {
    await DB.close();
  }
});
