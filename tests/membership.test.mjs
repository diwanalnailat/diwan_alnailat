import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, state, owner, addMember, full } from "./support.mjs";
const phoneEnv = {
  WHATSAPP_ENABLED: "true",
  WHATSAPP_TOKEN: "test",
  WHATSAPP_PHONE_ID: "12345",
  WHATSAPP_API_VERSION: "v24.0",
  WHATSAPP_LANGUAGE: "ar",
  WHATSAPP_OTP_TEMPLATE: "otp",
  OTP_SECRET: "test-secret-with-at-least-thirty-two-characters",
};
function phoneProvider(a) {
  Object.assign(a.env, phoneEnv);
  let code;
  a.env.PROVIDER_FETCH = async (url, init) => {
    const b = JSON.parse(init.body);
    code = b.template.components.find((c) => c.type === "body").parameters[0]
      .text;
    return new Response(
      JSON.stringify({ messages: [{ id: crypto.randomUUID() }] }),
    );
  };
  return async (as, phone, name) => {
    const request = await a.req("auth/request", { phone, consent: true }, as);
    assert.equal(request.status, 200, JSON.stringify(request.data));
    return a.req(
      "auth/verify",
      {
        challenge_id: request.data.challenge_id,
        code,
        name,
        notifications: true,
      },
      as,
    );
  };
}
const saveMember = (a, m, overrides = {}) =>
  a.req("users/save", {
    id: m.id,
    version: m.version,
    name: m.name,
    email: m.email,
    phone: m.phone,
    team: m.team,
    status: m.status,
    grants: m.grants,
    bundles: m.bundles,
    ...overrides,
  });
test("join is pending; admin can grant full access, revoke it, and suspend without exposing other accounts", async () => {
  const a = await fixture();
  try {
    const join = phoneProvider(a),
      person = { id: "new-site-person", email: "join@example.test" };
    let r = await join(person, "+966500777111", "عضو جديد");
    assert.equal(r.data.status, "pending");
    assert.equal((await a.req("state", undefined, person)).status, 403);
    const own = (await a.req("auth/status", undefined, person)).data.account;
    assert.equal(own.name, "عضو جديد");
    assert.equal(own.status, "pending");
    assert.equal(own.grants, undefined);
    let m = (await state(a)).members.find((m) => m.name === "عضو جديد");
    r = await saveMember(a, m, { status: "active", grants: full });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    let st = await state(a, person);
    assert.ok(st.modules.includes("users"));
    assert.ok(st.modules.includes("expenses"));
    assert.ok(st.modules.includes("settings"));
    m = (await state(a)).members.find((x) => x.id === m.id);
    assert.equal(
      (
        await saveMember(a, m, {
          grants: [],
          memberships: [{ committee_id: a.cid, role: "member" }],
        })
      ).status,
      200,
    );
    st = await state(a, person);
    assert.equal(st.modules.includes("users"), false);
    assert.equal(st.modules.includes("settings"), false);
    assert.equal(st.committees.length, 1);
    assert.equal(
      (
        await a.req(
          "users/save",
          { name: "forbidden", status: "active", grants: full },
          person,
        )
      ).status,
      403,
    );
    m = (await state(a)).members.find((x) => x.id === m.id);
    assert.equal((await saveMember(a, m, { status: "suspended" })).status, 200);
    assert.equal((await a.req("state", undefined, person)).status, 403);
    assert.equal(
      (await a.req("auth/status", undefined, person)).data.account.status,
      "suspended",
    );
  } finally {
    a.DB.close();
  }
});
test("a verified phone links the prepared record and preserves prior approval without duplicates", async () => {
  const a = await fixture();
  try {
    const join = phoneProvider(a);
    for (const [ix, status] of ["active", "invited", "suspended"].entries()) {
      const phone = "+96650088811" + ix,
        as = { id: "prepared-" + ix, email: "prepared" + ix + "@example.test" };
      let r = await a.req("users/save", {
        name: "عضو مجهز " + ix,
        phone,
        status,
        grants: full,
        bundles: [],
      });
      assert.equal(r.status, 200);
      const id = r.data.id;
      r = await join(as, phone, "لا يغيّر الاسم المعتمد");
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.status, status === "invited" ? "pending" : status);
      const row = await a.DB.prepare(
        "SELECT id,name,site_id FROM nl_members WHERE phone=?",
      )
        .bind(phone)
        .first();
      assert.equal(row.id, id);
      assert.equal(row.site_id, as.id);
      assert.equal(row.name, "عضو مجهز " + ix);
      const before = (await state(a)).members.length;
      const foreign = {
        id: "foreign-" + ix,
        email: "foreign" + ix + "@example.test",
      };
      r = await join(foreign, phone, "آخر");
      assert.equal(r.status, 409);
      assert.equal((await state(a)).members.length, before);
      assert.equal(
        (
          await a.DB.prepare("SELECT site_id FROM nl_members WHERE id=?")
            .bind(id)
            .first()
        ).site_id,
        as.id,
      );
    }
  } finally {
    a.DB.close();
  }
});
test("preview resolves committee access using server grants, and global authority cannot escape explicit restrictions", async () => {
  const a = await fixture();
  try {
    let r = await a.req("users/access-preview", {
      grants: [],
      bundles: [],
      memberships: [{ committee_id: a.cid, role: "manager" }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(
      r.data.access.some(
        (x) => x.name === "المهام" && x.actions.includes("اعتماد"),
      ),
    );
    assert.equal(
      r.data.access.some((x) => x.name === "الأعضاء"),
      false,
    );
    r = await a.req("users/access-preview", {
      grants: full,
      bundles: [],
      memberships: [],
    });
    assert.equal(r.status, 200);
    assert.ok(
      r.data.access.some(
        (x) => x.name === "الأعضاء" && x.actions.includes("إدارة"),
      ),
    );
    const restricted = await addMember(a, "restricted-admin", [
      ...full,
      { resource: "expenses", action: "view", effect: "deny", scope: "all" },
    ]);
    r = await a.req(
      "users/save",
      { name: "escalation", status: "active", grants: full, bundles: [] },
      restricted,
    );
    assert.equal(r.status, 403);
    r = await a.req(
      "users/save",
      {
        name: "role escalation",
        status: "active",
        grants: [],
        bundles: [],
        memberships: [{ committee_id: a.cid, role: "manager" }],
      },
      restricted,
    );
    assert.equal(r.status, 403);
  } finally {
    a.DB.close();
  }
});
