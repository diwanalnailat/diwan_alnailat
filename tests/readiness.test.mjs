import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import {
  fixture,
  state,
  owner,
  addMember,
  addProject,
  saveTask,
  saveExpense,
  upload,
  review,
} from "./support.mjs";
import { maintain } from "../lib/operations.js";
import { hmac } from "../lib/integrations.js";

const ai = {
  AI_ENABLED: "true",
  OPENAI_API_KEY: "private-test-secret",
  OPENAI_MODEL: "test-model",
};
const output = (items) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: items,
      usage: { total_tokens: 25 },
    }),
  );
const answer = (text = "تمت قراءة السجلات المتاحة") =>
  output([
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }],
    },
  ]);
const tool = (name, args) =>
  output([
    {
      type: "function_call",
      name,
      call_id: "c1",
      arguments: JSON.stringify(args),
    },
  ]);

test("Sanad retrieves beyond its initial sample, rejects inaccessible records and never fabricates a draft ID", async () => {
  const a = await fixture();
  try {
    Object.assign(a.env, ai);
    const id = await saveTask(a);
    let calls = 0;
    a.env.PROVIDER_FETCH = async (url, init) => {
      const b = JSON.parse(init.body);
      calls++;
      assert.equal(b.store, false);
      assert.ok(!init.body.includes("private-test-secret"));
      if (calls === 1) return tool("read_record", { resource: "tasks", id });
      const got = JSON.parse(b.input.at(-1).output);
      assert.equal(got.id, id);
      assert.equal(got.description, "تفاصيل التنفيذ");
      return answer();
    };
    assert.equal(
      (
        await a.req(
          "agent/ask",
          { message: "تفاصيل مهمتي", context: { task_id: id } },
          a.member,
        )
      ).status,
      200,
    );
    a.env.PROVIDER_FETCH = async (url, init) => {
      const b = JSON.parse(init.body);
      if (b.input.at(-1).role === "user")
        return tool("read_record", { resource: "tasks", id: "not-visible" });
      assert.ok(JSON.parse(b.input.at(-1).output).error);
      return answer("السجل غير متاح");
    };
    assert.equal(
      (await a.req("agent/ask", { message: "اقرأ سجلًا مخفيًا" }, a.member))
        .status,
      200,
    );
    a.env.PROVIDER_FETCH = async (url, init) => {
      const b = JSON.parse(init.body);
      if (b.input.at(-1).role === "user")
        return tool("prepare_record", {
          resource: "tasks",
          fields: [{ name: "committee_id", value: "invented" }],
        });
      assert.ok(JSON.parse(b.input.at(-1).output).error);
      return answer("حدد اللجنة المتاحة");
    };
    const draft = await a.req("agent/ask", { message: "جهز مهمة" });
    assert.equal(draft.status, 200);
    assert.deepEqual(draft.data.proposal, {});
    const original = await a.DB.prepare("SELECT * FROM nl_tasks WHERE id=?")
      .bind(id)
      .first();
    const keys = Object.keys(original);
    for (let i = 0; i < 65; i++)
      await a.DB.prepare(
        `INSERT INTO nl_tasks(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
      )
        .bind(
          ...keys.map((k) =>
            k === "id"
              ? "copy-" + i
              : k === "title"
                ? "مهمة بحث " + i
                : original[k],
          ),
        )
        .run();
    a.env.PROVIDER_FETCH = async (url, init) => {
      const b = JSON.parse(init.body);
      if (b.input.at(-1).role === "user")
        return tool("search_records", {
          resource: "tasks",
          query: "مهمة بحث",
          offset: 60,
        });
      const found = JSON.parse(b.input.at(-1).output);
      assert.equal(found.total, 65);
      assert.equal(found.records.length, 5);
      return answer();
    };
    assert.equal(
      (await a.req("agent/ask", { message: "ابحث في كل المهام" }, a.member))
        .status,
      200,
    );
  } finally {
    a.DB.close();
  }
});

test("Sanad drops memory after reassignment, isolates contexts, and checks revoked access before returning", async () => {
  const a = await fixture();
  try {
    Object.assign(a.env, ai);
    const id = await saveTask(a);
    a.env.PROVIDER_FETCH = async () => answer("تفاصيل خاصة بالمهمة");
    assert.equal(
      (
        await a.req(
          "agent/ask",
          { message: "private-context", context: { task_id: id } },
          a.member,
        )
      ).status,
      200,
    );
    assert.equal(
      (await a.req("agent/history", undefined, a.member)).data.turns.length,
      1,
    );
    a.env.PROVIDER_FETCH = async (url, init) => {
      assert.ok(
        !JSON.parse(init.body).input.some(
          (t) => t.content === "private-context",
        ),
      );
      return answer();
    };
    assert.equal(
      (await a.req("agent/ask", { message: "سؤال عام" }, a.member)).status,
      200,
    );
    await a.DB.prepare("UPDATE nl_tasks SET assignee_id=? WHERE id=?")
      .bind(a.manager.memberId, id)
      .run();
    assert.equal(
      (await a.req("agent/history", undefined, a.member)).data.turns.length,
      0,
    );
    a.env.PROVIDER_FETCH = async () => {
      await a.DB.prepare("UPDATE nl_members SET status='suspended' WHERE id=?")
        .bind(a.member.memberId)
        .run();
      return answer("لا يجب أن تُرجع هذه الإجابة بعد الإيقاف");
    };
    const r = await a.req(
      "agent/ask",
      { message: "تغيير أثناء الطلب" },
      a.member,
    );
    assert.equal(r.status, 403);
    assert.equal(
      (
        await a.DB.prepare(
          "SELECT count(*) AS n FROM nl_agent_turns WHERE message=?",
        )
          .bind("تغيير أثناء الطلب")
          .first()
      ).n,
      0,
    );
  } finally {
    a.DB.close();
  }
});

test("Sanad customization is validated, personal deletion is isolated, and retention is enforced", async () => {
  const a = await fixture();
  try {
    Object.assign(a.env, ai);
    a.env.PROVIDER_FETCH = async () => answer();
    await a.req("agent/ask", { message: "owner" });
    await a.req("agent/ask", { message: "member" }, a.member);
    assert.equal(
      (await a.req("agent/history/clear", {}, a.member)).status,
      200,
    );
    assert.equal(
      (await a.req("agent/history", undefined, a.member)).data.turns.length,
      0,
    );
    assert.equal((await a.req("agent/history")).data.turns.length, 1);
    let st = await state(a);
    assert.equal(
      (
        await a.req("settings/save", {
          version: st.settings_version,
          settings: { sanad: { ...st.settings.sanad, retention_days: 0 } },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await a.req("settings/save", {
          version: st.settings_version,
          settings: {
            sanad: { ...st.settings.sanad, tone: "formal", retention_days: 7 },
          },
        })
      ).status,
      200,
    );
    await a.DB.prepare(
      "UPDATE nl_agent_turns SET created='2020-01-01T00:00:00Z'",
    ).run();
    assert.equal((await a.req("agent/history")).data.turns.length, 0);
    await maintain(a.env);
    assert.equal(
      (await a.DB.prepare("SELECT count(*) AS n FROM nl_agent_turns").first())
        .n,
      0,
    );
  } finally {
    a.DB.close();
  }
});

test("media engagement scope applies to lists, export and private files; edits preserve hidden years", async () => {
  const a = await fixture();
  try {
    const other = await addProject(a, "موسم محجوب");
    const file = await upload(a, "suppliers", "proof");
    const form = {
      name: "إعلامي",
      files: [file],
      media_profile: {
        role: "مؤثر",
        accounts: [],
        engagements: [
          {
            id: "visible-year",
            project_id: a.pid,
            title: "عمل متاح",
            status: "منشور",
            file_ids: [],
          },
          {
            id: "hidden-year",
            project_id: other,
            title: "عمل محجوب",
            status: "منشور",
            file_ids: [file],
          },
        ],
      },
    };
    const created = await a.req("suppliers/save", form);
    assert.equal(created.status, 200);
    const user = await addMember(a, "media-reader", [
      ...["view", "edit", "export"].map((action) => ({
        resource: "suppliers",
        action,
        effect: "allow",
        scope: "all",
      })),
      {
        resource: "projects",
        action: "view",
        effect: "allow",
        scope: "project",
        projectId: a.pid,
      },
    ]);
    const st = await state(a, user),
      supplier = st.suppliers[0];
    assert.deepEqual(
      supplier.meta.media_profile.engagements.map((e) => e.id),
      ["visible-year"],
    );
    assert.ok(!st.files.some((f) => f.id === file));
    assert.equal((await a.req("files/" + file, undefined, user)).status, 403);
    assert.equal(
      (await a.req("export?type=media", undefined, user)).data.rows.length,
      1,
    );
    const updated = await a.req(
      "suppliers/save",
      {
        ...form,
        id: supplier.id,
        version: supplier.version,
        files: [],
        media_profile: supplier.meta.media_profile,
      },
      user,
    );
    assert.equal(updated.status, 200);
    assert.equal(
      (await state(a)).suppliers[0].meta.media_profile.engagements.length,
      2,
    );
  } finally {
    a.DB.close();
  }
});

test("expense conflict uses an administrative delegate and never lets a claimant approve their own expense", async () => {
  const a = await fixture();
  try {
    const delegate = await addMember(a, "finance-delegate");
    const k = (await state(a)).committees[0];
    assert.equal(
      (
        await a.req("committees/save", {
          id: k.id,
          version: k.version,
          name: k.name,
          review_delegate_id: delegate.memberId,
        })
      ).status,
      200,
    );
    const id = await saveExpense(a);
    // Simulate an existing manager claim requiring the new conflict rule.
    const e = (await state(a)).expenses[0];
    await a.DB.prepare("UPDATE nl_expenses SET created_by=?,meta=? WHERE id=?")
      .bind(
        a.manager.memberId,
        JSON.stringify({ ...e.meta, claimant_id: a.manager.memberId }),
        id,
      )
      .run();
    assert.equal((await review(a, id, a.manager)).status, 403);
    assert.deepEqual((await state(a)).expenses[0].effective_route, [
      delegate.memberId,
      "owner",
    ]);
    assert.equal((await review(a, id, delegate)).status, 200);
    assert.equal((await review(a, id, owner)).status, 200);
  } finally {
    a.DB.close();
  }
});

test("delegation cannot extend expiry or smuggle approval via committee manager assignment", async () => {
  const a = await fixture();
  try {
    const temporary = await addMember(a, "temporary-admin", [
      {
        resource: "*",
        action: "*",
        effect: "allow",
        scope: "all",
        expires: new Date(Date.now() + 86400000).toISOString(),
      },
    ]);
    assert.equal(
      (
        await a.req(
          "users/save",
          {
            name: "permanent",
            status: "active",
            grants: [
              {
                resource: "tasks",
                action: "view",
                effect: "allow",
                scope: "all",
              },
            ],
          },
          temporary,
        )
      ).status,
      403,
    );
    const limited = await addMember(a, "limited-admin", [
      { resource: "users", action: "manage", effect: "allow", scope: "all" },
      { resource: "committees", action: "edit", effect: "allow", scope: "all" },
    ]);
    const k = (await state(a)).committees[0];
    assert.equal(
      (
        await a.req(
          "committees/save",
          {
            id: k.id,
            version: k.version,
            name: k.name,
            manager_id: a.member.memberId,
            members: k.members,
          },
          limited,
        )
      ).status,
      403,
    );
  } finally {
    a.DB.close();
  }
});

test("readiness discloses missing keys without secrets and maintenance deduplicates reminders and reconciles stuck jobs", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a);
    await a.DB.prepare("UPDATE nl_tasks SET due='2020-01-01' WHERE id=?")
      .bind(id)
      .run();
    await a.DB.prepare(
      "INSERT INTO nl_delivery_jobs(id,status,attempts,updated) VALUES('stuck','sending',1,'2020-01-01')",
    ).run();
    a.env.OPENAI_API_KEY = "must-not-be-exposed";
    assert.equal((await a.req("readiness", undefined, a.member)).status, 403);
    const r = await a.req("readiness");
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify(r.data).includes("must-not-be-exposed"));
    assert.ok(
      r.data.components
        .find((c) => c.id === "ai")
        .missing.includes("OPENAI_MODEL"),
    );
    await maintain(a.env);
    await a.DB.prepare(
      "DELETE FROM nl_integration_limits WHERE key='maintenance:lease'",
    ).run();
    await maintain(a.env);
    assert.equal(
      (
        await a.DB.prepare(
          "SELECT count(*) AS n FROM nl_notifications WHERE id LIKE 'due_%' AND channel='in_app'",
        ).first()
      ).n,
      1,
    );
    assert.equal(
      (
        await a.DB.prepare(
          "SELECT status FROM nl_delivery_jobs WHERE id='stuck'",
        ).first()
      ).status,
      "needs_review",
    );
  } finally {
    a.DB.close();
  }
});

test("request boundaries cap chunked input, reject malformed bodies and hide internal exceptions", async () => {
  const a = await fixture();
  try {
    const headers = {
      origin: "https://diwan.test",
      "oai-authenticated-user-id": owner.id,
      "oai-authenticated-user-email": owner.email,
    };
    for (const body of ["null", "[]", "{"]) {
      const r = await worker.fetch(
        new Request("https://diwan.test/api/users/save", {
          method: "POST",
          headers,
          body,
        }),
        a.env,
      );
      assert.equal(r.status, 400);
    }
    const r = await worker.fetch(
      new Request("https://diwan.test/api/users/save", {
        method: "POST",
        headers,
        body: "x".repeat(1048577),
      }),
      a.env,
    );
    assert.equal(r.status, 413);
    const broken = {
      ...a.env,
      DB: {
        prepare: () => {
          throw Error("private SQL trace password=secret");
        },
      },
    };
    const e = await worker.fetch(
      new Request("https://diwan.test/api/state", { headers }),
      broken,
    );
    assert.equal(e.status, 500);
    assert.ok(!(await e.text()).includes("secret"));
    assert.equal(
      (await worker.fetch(new Request("https://diwan.test/api/health"), broken))
        .status,
      503,
    );
  } finally {
    a.DB.close();
  }
});

test("signed late WhatsApp failures cannot overwrite a delivery/read confirmation", async () => {
  const a = await fixture();
  try {
    a.env.WHATSAPP_APP_SECRET = "sig-secret";
    await a.DB.prepare(
      "INSERT INTO nl_delivery_jobs(id,provider_id,status,updated) VALUES('job','wamid.1','read','2026-01-01')",
    ).run();
    const raw = JSON.stringify({
      entry: [
        {
          changes: [
            { value: { statuses: [{ id: "wamid.1", status: "failed" }] } },
          ],
        },
      ],
    });
    const r = await worker.fetch(
      new Request("https://diwan.test/api/webhooks/whatsapp", {
        method: "POST",
        headers: {
          "x-hub-signature-256":
            "sha256=" + (await hmac(a.env.WHATSAPP_APP_SECRET, raw)),
        },
        body: raw,
      }),
      a.env,
    );
    assert.equal(r.status, 200);
    assert.equal(
      (
        await a.DB.prepare(
          "SELECT status FROM nl_delivery_jobs WHERE id='job'",
        ).first()
      ).status,
      "read",
    );
  } finally {
    a.DB.close();
  }
});
