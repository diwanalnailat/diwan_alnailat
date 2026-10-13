import test from "node:test";
import assert from "node:assert/strict";
import { fixture, upload, saveExpense } from "./support.mjs";

const invoice = () =>
  Object.fromEntries(
    Object.entries({
      supplier_name: "Synthetic supplier",
      number: "INV-42",
      date: "2026-10-13",
      amount: "115.00",
      tax: "15.00",
      description: "Synthetic supplies",
    }).map(([key, value]) => [key, { value, confidence: "clear" }]),
  );
const provider = (a, callback = () => {}) => {
  const calls = [];
  Object.assign(a.env, {
    AI_ENABLED: "true",
    OPENAI_API_KEY: "synthetic-not-a-secret",
    OPENAI_MODEL: "offline-test",
    PROVIDER_FETCH: async (_, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      await callback(body);
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(invoice()) }],
          },
        ],
      });
    },
  });
  return calls;
};
const draft = (a, as = a.member) =>
  upload(a, "expenses", "invoice", as, { project: a.pid, committee: a.cid });
const deny = async (a, resource, action = "view") =>
  a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
    .bind(
      JSON.stringify([{ resource, action, scope: "all", effect: "deny" }]),
      a.member.memberId,
    )
    .run();

test("ordinary committee member extracts own financial draft without finance-wide grants or financial mutations", async () => {
  const a = await fixture();
  try {
    const file = await draft(a),
      calls = provider(a);
    const result = await a.req("extract", { file_id: file }, a.member);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.fields.amount.value, "115.00");
    assert.equal(result.data.requires_review, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].instructions, /غير موثوقة/);
    assert.match(calls[0].instructions, /غير المالي/);
    assert.equal(calls[0].tools, undefined);
    assert.equal(calls[0].input[0].content[1].type, "input_file");
    assert.ok(
      !JSON.stringify(calls[0]).includes(a.pid),
      "provider receives no project data or budgets",
    );
    assert.equal(
      (await a.DB.prepare("SELECT count(*) AS n FROM nl_expenses").first()).n,
      0,
    );
    assert.equal(
      (await a.DB.prepare("SELECT count(*) AS n FROM nl_payments").first()).n,
      0,
    );
  } finally {
    await a.DB.close();
  }
});

test("invoice extraction enforces own draft, expense create, download, amount-field and explicit AI denies before provider", async () => {
  const a = await fixture();
  try {
    const file = await draft(a),
      calls = provider(a);
    assert.equal(
      (await a.req("extract", { file_id: file }, a.outsider)).status,
      403,
    );
    for (const [resource, action] of [
      ["expenses", "create"],
      ["expenses", "download"],
      ["expenses.amount", "view"],
      ["assistant", "view"],
    ]) {
      await deny(a, resource, action);
      assert.equal(
        (await a.req("extract", { file_id: file }, a.member)).status,
        403,
        `${resource}:${action}`,
      );
    }
    assert.equal(calls.length, 0);
  } finally {
    await a.DB.close();
  }
});

test("invoice extraction rechecks revocation and account suspension after provider returns", async () => {
  for (const revoke of [
    (a) => deny(a, "expenses.amount"),
    (a) => deny(a, "assistant"),
    (a) =>
      a.DB.prepare("UPDATE nl_members SET status='suspended' WHERE id=?")
        .bind(a.member.memberId)
        .run(),
  ]) {
    const a = await fixture();
    try {
      const file = await draft(a),
        calls = provider(a, () => revoke(a));
      const result = await a.req("extract", { file_id: file }, a.member);
      assert.equal(result.status, 403);
      assert.ok(!JSON.stringify(result.data).includes("INV-42"));
      assert.equal(calls.length, 1);
    } finally {
      await a.DB.close();
    }
  }
});

test("existing expense requires edit and editable state; closed projects and unrelated document resources are rejected", async () => {
  const a = await fixture();
  try {
    const id = await saveExpense(a, { status: "draft" });
    const file = await upload(a, "expenses", "receipt", a.member, {
      entity: id,
      attach_later: "true",
      project: a.pid,
      committee: a.cid,
    });
    const calls = provider(a);
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      200,
    );
    await deny(a, "expenses", "edit");
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      403,
    );
    await a.DB.prepare("UPDATE nl_members SET grants='[]' WHERE id=?")
      .bind(a.member.memberId)
      .run();
    await a.DB.prepare("UPDATE nl_expenses SET status='pending' WHERE id=?")
      .bind(id)
      .run();
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      403,
    );
    await a.DB.prepare("UPDATE nl_expenses SET status='draft' WHERE id=?")
      .bind(id)
      .run();
    await a.DB.prepare("UPDATE nl_projects SET status='closed' WHERE id=?")
      .bind(a.pid)
      .run();
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      403,
    );
    assert.equal(calls.length, 1);
  } finally {
    await a.DB.close();
  }
});

test("extraction supports bounded plain text and refuses unsupported attachments and non-expense files", async () => {
  const a = await fixture();
  try {
    const file = await draft(a),
      calls = provider(a);
    await a.DB.prepare("UPDATE nl_files SET mime='text/plain' WHERE id=?")
      .bind(file)
      .run();
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      200,
    );
    assert.equal(calls[0].input[0].content[1].type, "input_text");
    const original = await a.DB.prepare("SELECT * FROM nl_files WHERE id=?")
      .bind(file)
      .first();
    const textMeta = JSON.parse(original.meta);
    delete textMeta.storage;
    a.objects.set(
      original.object_key,
      new TextEncoder().encode("x".repeat(80001)),
    );
    await a.DB.prepare("UPDATE nl_files SET size=80001,meta=? WHERE id=?")
      .bind(JSON.stringify(textMeta), file)
      .run();
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      413,
    );
    await a.DB.prepare(
      "UPDATE nl_files SET mime='application/msword' WHERE id=?",
    )
      .bind(file)
      .run();
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      400,
    );
    const row = await a.DB.prepare("SELECT meta FROM nl_files WHERE id=?")
      .bind(file)
      .first();
    await a.DB.prepare("UPDATE nl_files SET meta=? WHERE id=?")
      .bind(
        JSON.stringify({
          ...JSON.parse(row.meta),
          pending_resource: "documents",
        }),
        file,
      )
      .run();
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      400,
    );
    assert.equal(calls.length, 1);
  } finally {
    await a.DB.close();
  }
});

test("Word and Excel financial documents use bounded file inputs without exposing workspace records", async () => {
  const a = await fixture();
  try {
    const file = await draft(a),
      calls = provider(a);
    for (const [mime, name] of [
      [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "invoice.docx",
      ],
      [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "invoice.xlsx",
      ],
    ]) {
      await a.DB.prepare("UPDATE nl_files SET mime=?,name=? WHERE id=?")
        .bind(mime, name, file)
        .run();
      const result = await a.req("extract", { file_id: file }, a.member);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const input = calls.at(-1).input[0].content[1];
      assert.equal(input.type, "input_file");
      assert.equal(input.filename, name);
      assert.ok(input.file_data.startsWith(`data:${mime};base64,`));
      assert.ok(!JSON.stringify(calls.at(-1)).includes(a.pid));
    }
    assert.equal(calls.length, 2);
  } finally {
    await a.DB.close();
  }
});

test("extraction shares the AI minute quota and never sends requests past its limit", async () => {
  const a = await fixture();
  try {
    const file = await draft(a),
      calls = provider(a);
    await a.DB.prepare(
      "INSERT INTO nl_integration_limits(key,hits,expires) VALUES(?,?,?)",
    )
      .bind("ai:minute:" + a.member.memberId, 10, Date.now() + 60000)
      .run();
    assert.equal(
      (await a.req("extract", { file_id: file }, a.member)).status,
      429,
    );
    assert.equal(calls.length, 0);
  } finally {
    await a.DB.close();
  }
});

test("extraction leaves contradictory tax for manual review instead of autofilling more tax than the total", async () => {
  const a = await fixture();
  try {
    const file = await draft(a);
    provider(a);
    a.env.PROVIDER_FETCH = async () => {
      const fields = invoice();
      fields.tax.value = "150.00";
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(fields) }],
          },
        ],
      });
    };
    const result = await a.req("extract", { file_id: file }, a.member);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.fields.amount.value, "115.00");
    assert.deepEqual(result.data.fields.tax, {
      value: null,
      confidence: "uncertain",
    });
    assert.equal(result.data.requires_review, true);
  } finally {
    await a.DB.close();
  }
});

test("extraction normalizes source decimal separators and Arabic digits without multiplying the amount", async () => {
  const a = await fixture();
  try {
    const file = await draft(a);
    provider(a);
    for (const [raw, expected] of [
      ["٢٣٠٫٠٠", "230.00"],
      ["۲۳۰٫۰۰", "230.00"],
      ["١٬٢٣٠٫٥٠", "1230.50"],
      ["1,230.50", "1230.50"],
      ["230,00", "230.00"],
      ["1,23,0.00", null],
      ["230.000", null],
    ]) {
      a.env.PROVIDER_FETCH = async () => {
        const fields = invoice();
        fields.amount.value = raw;
        fields.tax.value = "٠٫٠٠";
        return Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(fields) }],
            },
          ],
        });
      };
      const result = await a.req("extract", { file_id: file }, a.member);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal(result.data.fields.amount.value, expected, raw);
      assert.equal(result.data.fields.tax.value, "0.00");
    }
  } finally {
    await a.DB.close();
  }
});
