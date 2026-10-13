import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import { fixture } from "./support.mjs";

const setup = (
  a,
  handler = async () => Response.json({ text: "جهز استقبال المشاركين" }),
) => {
  const calls = [];
  Object.assign(a.env, {
    AI_ENABLED: "true",
    OPENAI_API_KEY: "synthetic-only",
    OPENAI_MODEL: "offline-model",
    OPENAI_TRANSCRIBE_MODEL: "offline-voice",
    PROVIDER_FETCH: async (url, init) => {
      calls.push({ url, init });
      return handler();
    },
  });
  return calls;
};
const transcribe = async (a, as = a.member, mime = "audio/wav") => {
  const form = new FormData();
  form.set(
    "file",
    new File(["RIFF synthetic recording"], "recording.wav", { type: mime }),
  );
  const result = await worker.fetch(
    new Request("https://diwan.test/api/agent/transcribe", {
      method: "POST",
      headers: {
        origin: "https://diwan.test",
        ...(as
          ? {
              "oai-authenticated-user-id": as.id,
              "oai-authenticated-user-email": as.email,
            }
          : {}),
      },
      body: form,
    }),
    a.env,
  );
  return { status: result.status, data: await result.json() };
};

test("member voice transcription returns text only and enforces authentication, explicit denial and audio input", async () => {
  const a = await fixture();
  try {
    const calls = setup(a);
    const result = await transcribe(a);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.deepEqual(result.data, { text: "جهز استقبال المشاركين" });
    assert.equal(
      calls[0].url,
      "https://api.openai.com/v1/audio/transcriptions",
    );
    assert.equal(calls[0].init.body.get("language"), "ar");
    assert.equal(calls[0].init.body.get("model"), "offline-voice");
    assert.equal((await transcribe(a, null)).status, 401);
    assert.equal((await transcribe(a, a.member, "text/plain")).status, 400);
    await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
      .bind(
        JSON.stringify([
          {
            resource: "assistant",
            action: "view",
            effect: "deny",
            scope: "all",
          },
        ]),
        a.member.memberId,
      )
      .run();
    assert.equal((await transcribe(a)).status, 403);
    assert.equal(calls.length, 1);
    assert.equal(
      (await a.DB.prepare("SELECT count(*) AS n FROM nl_tasks").first()).n,
      0,
    );
  } finally {
    await a.DB.close();
  }
});

test("voice rechecks permission revocation and account suspension before returning the transcript", async () => {
  for (const update of [
    (a) =>
      a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
        .bind(
          JSON.stringify([
            {
              resource: "assistant",
              action: "view",
              effect: "deny",
              scope: "all",
            },
          ]),
          a.member.memberId,
        )
        .run(),
    (a) =>
      a.DB.prepare("UPDATE nl_members SET status='suspended' WHERE id=?")
        .bind(a.member.memberId)
        .run(),
  ]) {
    const a = await fixture();
    try {
      const calls = setup(a, async () => {
        await update(a);
        return Response.json({ text: "PRIVATE_TRANSCRIPT" });
      });
      const result = await transcribe(a);
      assert.equal(result.status, 403, JSON.stringify(result.data));
      assert.ok(!JSON.stringify(result.data).includes("PRIVATE_TRANSCRIPT"));
      assert.equal(calls.length, 1);
    } finally {
      await a.DB.close();
    }
  }
});

test("voice rejects empty, malformed, oversized and failing provider responses without exposing provider details", async () => {
  const responses = [
    () => Response.json({ text: "" }),
    () => Response.json({ text: { secret: "PROVIDER_SECRET" } }),
    () => new Response("PROVIDER_SECRET"),
    () => Response.json({ text: "x".repeat(70000) }),
    () => new Response("PROVIDER_SECRET", { status: 500 }),
  ];
  for (const response of responses) {
    const a = await fixture();
    try {
      setup(a, response);
      const result = await transcribe(a);
      assert.equal(result.status, 502, JSON.stringify(result.data));
      assert.ok(!JSON.stringify(result.data).includes("PROVIDER_SECRET"));
    } finally {
      await a.DB.close();
    }
  }
});

test("voice shares AI request limits with chat, checklists and invoice extraction", async () => {
  for (const [key, hits] of [
    ["ai:minute:", 10],
    ["ai:day:", 100],
  ]) {
    const a = await fixture();
    try {
      const calls = setup(a);
      await a.DB.prepare(
        "INSERT INTO nl_integration_limits(key,hits,expires) VALUES(?,?,?)",
      )
        .bind(key + a.member.memberId, hits, Date.now() + 60000)
        .run();
      assert.equal((await transcribe(a)).status, 429);
      assert.equal(calls.length, 0);
    } finally {
      await a.DB.close();
    }
  }
});
