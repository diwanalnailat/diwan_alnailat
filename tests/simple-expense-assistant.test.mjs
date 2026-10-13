import test from "node:test";
import assert from "node:assert/strict";
import { scopedProvider, fixture } from "./support.mjs";

test("readiness and Sanad expense drafts work without a spending catalog", async () => {
  const a = await fixture();
  try {
    const committee = await a.DB.prepare(
      "SELECT config FROM nl_committees WHERE id=?",
    )
      .bind(a.cid)
      .first();
    await a.DB.prepare("UPDATE nl_committees SET config=? WHERE id=?")
      .bind(
        JSON.stringify({ ...JSON.parse(committee.config), budgetLines: [] }),
        a.cid,
      )
      .run();
    const ready = await a.req("readiness");
    assert.equal(ready.status, 200);
    assert.ok(
      !ready.data.issues.some((issue) => issue.issue.includes("بنود صرف")),
    );
    Object.assign(a.env, {
      AI_ENABLED: "true",
      OPENAI_API_KEY: "synthetic-test-only",
      OPENAI_MODEL: "test-model",
    });
    let calls = 0;
    a.env.PROVIDER_FETCH = scopedProvider(async (_, init) => {
      const body = JSON.parse(init.body);
      assert.ok(!body.instructions.includes('"budget_lines"'));
      const prepare = body.tools.find((t) => t.name === "prepare_record");
      assert.ok(!prepare.description.includes("budget_line_id"));
      calls++;
      if (calls === 1)
        return Response.json({
          status: "completed",
          output: [
            {
              type: "function_call",
              name: "prepare_record",
              call_id: "simple-expense",
              arguments: JSON.stringify({
                resource: "expenses",
                fields: [
                  { name: "committee_id", value: a.cid },
                  { name: "title", value: "ضيافة الفريق" },
                  { name: "amount", value: "50.25" },
                  { name: "date", value: "2026-10-13" },
                ],
              }),
            },
          ],
        });
      const draft = JSON.parse(body.input.at(-1).output);
      assert.deepEqual(draft.missing, []);
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "المسودة جاهزة للمراجعة في النموذج",
              },
            ],
          },
        ],
      });
    });
    const result = await a.req(
      "agent/ask",
      { message: "جهز مسودة مصروف ضيافة", context: { committee_id: a.cid } },
      a.manager,
    );
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(calls, 2);
    assert.equal(result.data.proposal.resource, "expenses");
    assert.deepEqual(result.data.proposal.missing, []);
    assert.equal(result.data.proposal.fields.budget_line_id, undefined);
    assert.equal(
      (await a.DB.prepare("SELECT COUNT(*) AS n FROM nl_expenses").first()).n,
      0,
      "Sanad prepares a draft without saving or approving money",
    );
  } finally {
    a.DB.close();
  }
});
