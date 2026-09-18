import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { dispatchNotifications } from "../worker.js";
import {
  fixture,
  state,
  addMember,
  upload,
  saveTask,
  saveExpense,
  review,
  owner,
} from "./support.mjs";
import { hmac } from "../lib/integrations.js";
const waEnv = {
  WHATSAPP_ENABLED: "true",
  WHATSAPP_TOKEN: "test-secret",
  WHATSAPP_PHONE_ID: "12345",
  WHATSAPP_API_VERSION: "v24.0",
  WHATSAPP_LANGUAGE: "ar",
  WHATSAPP_OTP_TEMPLATE: "otp",
  WHATSAPP_NOTIFICATION_TEMPLATE: "work_update",
  OTP_SECRET: "this-test-secret-is-at-least-thirty-two-characters",
  APP_BASE_URL: "https://diwan.test",
  WHATSAPP_APP_SECRET: "webhook-secret",
  WHATSAPP_VERIFY_TOKEN: "verify-token",
};
const aiEnv = {
  AI_ENABLED: "true",
  OPENAI_API_KEY: "test-secret",
  OPENAI_MODEL: "configured-model",
};
const answer = (text) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        },
      ],
      usage: { total_tokens: 20 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
test("committee approvers come from explicit scoped user grants; project cannot confer approval", async () => {
  const a = await fixture();
  try {
    const reviewer = await addMember(a, "reviewer", []),
      st = await state(a),
      c = st.committees[0];
    let r = await a.req("committees/save", {
      id: c.id,
      version: c.version,
      name: c.name,
      second_approver_id: reviewer.memberId,
    });
    assert.equal(r.status, 400);
    await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
      .bind(
        JSON.stringify(
          ["view", "approve"].map((action) => ({
            resource: "expenses",
            action,
            effect: "allow",
            scope: "committee",
            committeeId: c.id,
          })),
        ),
        reviewer.memberId,
      )
      .run();
    const candidate = (await state(a)).approvalCandidates.find(
      (u) => u.id === reviewer.memberId,
    );
    assert.deepEqual(candidate.committees, [c.id]);
    assert.deepEqual(candidate.projects, []);
    r = await a.req("committees/save", {
      id: c.id,
      version: c.version,
      name: c.name,
      second_approver_id: reviewer.memberId,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const updated = (await state(a)).committees[0];
    assert.equal(updated.config.second_approver_id, reviewer.memberId);
    const expenseId = await saveExpense(a);
    assert.equal((await review(a, expenseId, a.manager)).status, 200);
    const financeState = await state(a, reviewer);
    assert.equal(financeState.committees.length, 0);
    assert.equal(
      financeState.expenses[0].approval_context.config.second_approver_id,
      reviewer.memberId,
    );
    assert.ok(financeState.people.some((m) => m.id === a.manager.memberId));
    assert.equal((await review(a, expenseId, reviewer)).status, 200);

    r = await a.req("committees/save", {
      id: c.id,
      version: updated.version,
      name: c.name,
      second_approver_id: c.manager_id,
    });
    assert.equal(r.status, 400);
    assert.equal((await state(a)).projects[0].meta.supervisor_id, null);
  } finally {
    a.DB.close();
  }
});
test("Sanad uses scoped server data, returns editable drafts, persists privately and invalidates history after access changes", async () => {
  const a = await fixture();
  try {
    Object.assign(a.env, aiEnv);
    const task = await saveTask(a);
    let calls = 0;
    a.env.PROVIDER_FETCH = async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.ok(body.instructions.includes(task));
      assert.ok(!body.instructions.includes("test-secret"));
      calls++;
      if (calls === 1)
        return new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "function_call",
                call_id: "call-1",
                name: "prepare_record",
                arguments: JSON.stringify({
                  resource: "suppliers",
                  fields: [{ name: "name", value: "مورد الخيام" }],
                }),
              },
            ],
          }),
        );
      assert.equal(body.input.at(-1).type, "function_call_output");
      return answer("جهزت مسودة المورد لتراجعها.");
    };
    const r = await a.req("agent/ask", {
      message: "أضف مورد خيام",
      context: { project_id: a.pid },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.proposal.fields.name, "مورد الخيام");
    assert.equal((await state(a)).suppliers.length, 0);
    assert.equal((await a.req("agent/history")).data.turns.length, 1);
    assert.equal(
      (await a.req("agent/history", undefined, a.member)).data.turns.length,
      0,
    );
    await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
      .bind(
        JSON.stringify([
          { resource: "*", action: "*", effect: "allow", scope: "all" },
          {
            resource: "suppliers",
            action: "view",
            effect: "deny",
            scope: "all",
          },
        ]),
        "owner",
      )
      .run();
    assert.equal((await a.req("agent/history")).data.turns.length, 0);
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
    assert.equal(
      (await a.req("agent/ask", { message: "test" }, a.member)).status,
      403,
    );
  } finally {
    a.DB.close();
  }
});
test("invoice extraction keeps unclear fields empty and enforces private file ownership", async () => {
  const a = await fixture();
  try {
    Object.assign(a.env, aiEnv);
    const fid = await upload(a, "expenses", "invoice", a.member, {
      project: a.pid,
      committee: a.cid,
    });
    a.env.PROVIDER_FETCH = async (url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.input[0].content[1].type, "input_file");
      return answer(
        JSON.stringify(
          Object.fromEntries(
            [
              "supplier_name",
              "number",
              "date",
              "amount",
              "tax",
              "description",
            ].map((k) => [
              k,
              {
                value: k === "amount" ? "450.00" : "invented",
                confidence: k === "amount" ? "clear" : "uncertain",
              },
            ]),
          ),
        ),
      );
    };
    let r = await a.req("extract", { file_id: fid }, a.outsider);
    assert.equal(r.status, 403);
    r = await a.req("extract", { file_id: fid }, a.member);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.fields.amount.value, "450.00");
    assert.equal(r.data.fields.tax.value, null);
  } finally {
    a.DB.close();
  }
});
test("WhatsApp OTP is secret, one-time, rate-limited and creates only pending membership", async () => {
  const a = await fixture();
  try {
    Object.assign(a.env, waEnv);
    let code;
    a.env.PROVIDER_FETCH = async (url, init) => {
      const body = JSON.parse(init.body);
      code = body.template.components[0].parameters[0].text;
      assert.equal(body.template.components[1].parameters[0].text, code);
      return new Response(JSON.stringify({ messages: [{ id: "wamid.otp" }] }));
    };
    const guest = { id: "guest-site", email: "guest@example.test" };
    let r = await a.req(
      "auth/request",
      { phone: "+966500000001", consent: true },
      guest,
    );
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify(r.data).includes(code));
    const cid = r.data.challenge_id;
    assert.equal(
      (
        await a.req(
          "auth/request",
          { phone: "+966500000001", consent: true },
          guest,
        )
      ).status,
      429,
    );
    const dbRow = await a.DB.prepare("SELECT * FROM nl_otp WHERE id=?")
      .bind(cid)
      .first();
    assert.notEqual(dbRow.hash, code);
    r = await a.req(
      "auth/verify",
      { challenge_id: cid, code, name: "عضو جديد", notifications: true },
      guest,
    );
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.status, "pending");
    const member = await a.DB.prepare(
      "SELECT * FROM nl_members WHERE site_id=?",
    )
      .bind(guest.id)
      .first();
    assert.equal(member.grants, "[]");
    assert.equal(member.verified, 1);
    assert.equal((await a.req("state", undefined, guest)).status, 403);
    assert.equal(
      (await a.req("auth/verify", { challenge_id: cid, code }, guest)).status,
      400,
    );
  } finally {
    a.DB.close();
  }
});
test("outbox sends once only to consented authorized members and verifies delivery webhook signatures", async () => {
  const a = await fixture();
  try {
    Object.assign(a.env, waEnv);
    await a.DB.prepare("UPDATE nl_members SET verified=1,phone=? WHERE id=?")
      .bind("+966500000002", a.member.memberId)
      .run();
    await a.req("contact/preferences", { whatsapp: true }, a.member);
    await saveTask(a);
    let count = 0;
    a.env.PROVIDER_FETCH = async (url, init) => {
      count++;
      const b = JSON.parse(init.body);
      assert.equal(b.to, "966500000002");
      assert.ok(
        b.template.components[0].parameters[2].text.includes("#tasks?record="),
      );
      return new Response(
        JSON.stringify({ messages: [{ id: "wamid.notification" }] }),
      );
    };
    assert.equal((await dispatchNotifications(a.env)).accepted, 1);
    assert.equal((await dispatchNotifications(a.env)).accepted, 0);
    assert.equal(count, 1);
    const raw = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: "wamid.notification", status: "delivered" }],
              },
            },
          ],
        },
      ],
    });
    let response = await worker.fetch(
      new Request("https://diwan.test/api/webhooks/whatsapp", {
        method: "POST",
        body: raw,
      }),
      a.env,
    );
    assert.equal(response.status, 403);
    response = await worker.fetch(
      new Request("https://diwan.test/api/webhooks/whatsapp", {
        method: "POST",
        headers: {
          "x-hub-signature-256":
            "sha256=" + (await hmac(waEnv.WHATSAPP_APP_SECRET, raw)),
        },
        body: raw,
      }),
      a.env,
    );
    assert.equal(response.status, 200);
    assert.equal(
      (
        await a.DB.prepare(
          "SELECT status FROM nl_delivery_jobs WHERE provider_id=?",
        )
          .bind("wamid.notification")
          .first()
      ).status,
      "delivered",
    );
  } finally {
    a.DB.close();
  }
});
