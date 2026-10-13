import test from "node:test";
import assert from "node:assert/strict";
import { postgresTestDatabase } from "./postgres-support.mjs";
import { joinPublicEndpoint } from "../lib/join-public.js";
import { newApplicantGuard } from "../lib/join-eligibility.js";

test("existing members cannot request OTP, verify old drafts, upload or finalize; atomic guards reject concurrent membership", async () => {
  const DB = await postgresTestDatabase();
  const messages = [];
  const env = {
    DB,
    NODE_ENV: "production",
    APP_BASE_URL: "https://diwan.test",
    WHATSAPP_ENABLED: "true",
    WHATSAPP_PROVIDER: "green_api",
    GREEN_API_URL: "https://7107.api.greenapi.com",
    GREEN_API_INSTANCE: "1234567890",
    GREEN_API_TOKEN: "test-token-not-a-real-credential",
    OTP_SECRET: "a".repeat(48),
    PROVIDER_FETCH: async (_, opts) => {
      messages.push(JSON.parse(opts.body));
      return Response.json({ idMessage: "fixture" });
    },
  };
  const phone = "+966500000071";
  const payload = {
    name: "Synthetic Applicant",
    phone: "0500000071",
    reason: "Synthetic application",
    consent: true,
    attestation: true,
    policy_version: 0,
  };
  let cookie = "",
    challenge = "",
    token = "";
  const call = (action, body = {}) =>
    joinPublicEndpoint(
      new Request("https://diwan.test/auth/join/" + action, {
        method: "POST",
        headers: {
          origin: "https://diwan.test",
          "content-type": "application/json",
          cookie,
          "x-join-challenge": challenge,
          "x-join-upload": token,
        },
        body: JSON.stringify(body),
      }),
      env,
      action,
    );
  const add = (status) =>
    DB.prepare(
      "INSERT INTO nl_members(id,name,phone,status,created) VALUES('existing','Synthetic member',?,?,?)",
    )
      .bind(phone, status, new Date().toISOString())
      .run();
  const remove = () =>
    DB.prepare("DELETE FROM nl_members WHERE id='existing'").run();
  const denied = async (response) => {
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /عضو موجود/);
  };
  try {
    for (const status of ["active", "inactive", "pending"]) {
      await add(status);
      await denied(await call("request", payload));
      assert.equal(messages.length, 0, "no OTP sent to an existing member");
      await remove();
    }
    assert.equal(
      (await DB.prepare("SELECT count(*) AS n FROM nl_join_requests").first())
        .n,
      0,
    );
    const start = await call("request", {
      ...payload,
      attachments: [
        {
          kind: "identity",
          name: "fixture.pdf",
          size: 1,
          parts: ["a".repeat(64)],
        },
      ],
    });
    assert.equal(start.status, 200);
    challenge = (await start.json()).challenge_id;
    cookie = start.headers.get("set-cookie").split(";")[0];
    const credentials = {
      challenge_id: challenge,
      code: messages[0].message.match(/\b\d{6}\b/)[0],
      upload_mode: "chunked",
    };
    await add("active");
    await denied(await call("verify", credentials));
    assert.equal(
      (
        await DB.prepare("SELECT used FROM nl_otp WHERE id=?")
          .bind(challenge)
          .first()
      ).used,
      0,
    );
    await remove();
    const verified = await call("verify", credentials);
    assert.equal(verified.status, 200);
    token = (await verified.json()).upload_token;
    await add("active");
    for (const action of ["upload-status", "chunk", "complete"])
      await denied(await call(action));
    assert.equal(
      (await DB.prepare("SELECT status FROM nl_join_requests").first()).status,
      "verifying",
    );
    assert.equal(
      (await DB.prepare("SELECT count(*) AS n FROM nl_files").first()).n,
      0,
    );
    await assert.rejects(
      DB.batch([
        newApplicantGuard(DB, phone),
        DB.prepare(
          "UPDATE nl_join_requests SET status='pending' WHERE phone=?",
        ).bind(phone),
      ]),
    );
    assert.equal(
      (await DB.prepare("SELECT status FROM nl_join_requests").first()).status,
      "verifying",
    );
  } finally {
    await DB.close();
  }
});
