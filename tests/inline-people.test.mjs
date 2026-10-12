import test from "node:test";
import assert from "node:assert/strict";
import {
  app,
  addProject,
  addMember,
  fixture,
  owner,
  upload,
} from "./support.mjs";
import { dispatchNotifications } from "../worker.js";
import { loginEndpoint, sessionMember } from "../lib/login.js";
import { permitted, withCommittees } from "../lib/domain.js";
import { personInvitationEligible } from "../lib/person-invitations.js";

process.env.DIWAN_TEST_DATABASE = "postgres";

function configure(a) {
  const messages = [];
  Object.assign(a.env, {
    NODE_ENV: "production",
    APP_BASE_URL: "https://diwan.test",
    DIWAN_AUTH_ENABLED: "true",
    WHATSAPP_ENABLED: "true",
    WHATSAPP_PROVIDER: "green_api",
    GREEN_API_URL: "https://7107.api.greenapi.com",
    GREEN_API_INSTANCE: "1234567890",
    GREEN_API_TOKEN: "synthetic-provider-token",
    OTP_SECRET: "a".repeat(48),
    PROVIDER_FETCH: async (_, opts) => {
      messages.push(JSON.parse(opts.body));
      return Response.json({ idMessage: "inline-test-" + messages.length });
    },
  });
  return messages;
}
const person = (suffix, extra = {}) => ({
  token: "new-person:" + crypto.randomUUID(),
  name: "شخص اختبار " + suffix,
  phone: "05000000" + String(suffix).padStart(2, "0"),
  ...extra,
});
const row = (a, table, id) =>
  a.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
const memberByPhone = (a, phone) =>
  a.DB.prepare("SELECT * FROM nl_members WHERE phone=?").bind(phone).first();
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.data));
const taskBody = (a) => ({
  project_id: a.pid,
  title: "تنفيذ تجهيزات الاختبار",
  description: "تفاصيل مهمة الاختبار",
  priority: "normal",
  status: "todo",
  due: "2027-01-20",
  meta: {
    committee_id: a.cid,
    type: "execution",
    outcome: "اكتمال التجهيز",
    collaborators: [],
  },
});
function login(a, phone, code) {
  return loginEndpoint(
    new Request("https://diwan.test/auth/otp/invitation", {
      method: "POST",
      headers: {
        origin: "https://diwan.test",
        "Content-Type": "application/json",
        "x-forwarded-for": "192.0.2.25",
      },
      body: JSON.stringify({ phone, code }),
    }),
    a.env,
    "invitation",
  );
}

test("inline committee manager, second approver and delegate are scoped, atomic and idempotent", async () => {
  const a = await app(),
    messages = configure(a),
    pid = await addProject(a);
  const manager = person(1),
    approver = person(2, { email: "Approver@Example.test" }),
    delegate = person(3);
  const body = {
    project_id: pid,
    name: "لجنة الأشخاص",
    description: "",
    members: [],
    manager_id: manager.token,
    second_approver_id: approver.token,
    review_delegate_id: delegate.token,
    inline_people: [manager, approver, delegate],
  };
  const saved = await a.req("committees/save", body, owner, {
    key: "inline-committee",
  });
  ok(saved);
  assert.equal(saved.data.people_invitation, "queued");
  assert.equal(
    messages.length,
    0,
    "provider must run only after business commit",
  );
  const committee = await row(a, "nl_committees", saved.data.id),
    config = JSON.parse(committee.config);
  assert.equal(
    committee.manager_id,
    saved.data.inline_people_resolved[manager.token],
  );
  assert.equal(
    config.second_approver_id,
    saved.data.inline_people_resolved[approver.token],
  );
  assert.equal(
    config.review_delegate_id,
    saved.data.inline_people_resolved[delegate.token],
  );
  const members = JSON.parse(committee.members);
  assert.equal(members.length, 3);
  for (const p of body.inline_people) {
    const m = await row(
      a,
      "nl_members",
      saved.data.inline_people_resolved[p.token],
    );
    assert.equal(m.grants, "[]");
    assert.equal(m.bundles, "[]");
    assert.equal(m.verified, 0);
    assert.equal(m.email, p.email?.toLowerCase() || null);
    assert.equal(m.phone, "+966" + p.phone.slice(1));
    const link = members.find((x) => x.id === m.id);
    if (p !== manager)
      assert.deepEqual(link.grants.map((g) => [g.resource, g.action]).sort(), [
        ["expenses", "approve"],
        ["expenses", "view"],
      ]);
  }
  const replay = await a.req("committees/save", body, owner, {
    key: "inline-committee",
  });
  ok(replay);
  assert.deepEqual(replay.data, saved.data);
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 3);
  for (const message of messages) {
    assert.match(message.message, /لجنة الأشخاص.*مشروع اختبار/s);
    const code = message.message.match(/\b[A-F0-9]{12}\b/)?.[0];
    assert.ok(code);
    for (const table of [
      "nl_otp",
      "nl_notifications",
      "nl_receipts",
      "nl_audit",
    ])
      assert.ok(
        !JSON.stringify(
          (await a.DB.prepare(`SELECT * FROM ${table}`).all()).results,
        ).includes(code),
        table,
      );
  }
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 3);
  const approverMessage = messages.find(
    (m) => m.chatId === "966500000002@c.us",
  );
  assert.ok(approverMessage);
  const code = approverMessage.message.match(/\b[A-F0-9]{12}\b/)[0];
  const signedIn = await login(a, approver.phone, code);
  assert.equal(signedIn.status, 200, await signedIn.clone().text());
  const cookie = signedIn.headers.getSetCookie()[0].split(";")[0];
  assert.equal(
    (
      await sessionMember(
        new Request("https://diwan.test", { headers: { cookie } }),
        a.env,
      )
    ).id,
    config.second_approver_id,
  );
  assert.equal((await login(a, approver.phone, code)).status, 400);
  const delegateCode = messages
    .find((m) => m.chatId === "966500000003@c.us")
    .message.match(/\b[A-F0-9]{12}\b/)[0];
  config.review_delegate_id = null;
  await a.DB.prepare(
    "UPDATE nl_committees SET config=?,version=version+1 WHERE id=?",
  )
    .bind(JSON.stringify(config), committee.id)
    .run();
  assert.equal(
    (await login(a, delegate.phone, delegateCode)).status,
    400,
    "removing the alternate reviewer invalidates its invitation even while committee membership remains",
  );
});

test("inline people normalize and reuse phones while distinct approval conflicts roll back", async () => {
  const a = await app();
  configure(a);
  const pid = await addProject(a);
  const first = person(4),
    same = person(4, { phone: "+966 50 000 0004", name: "اسم مكرر" });
  let r = await a.req("committees/save", {
    project_id: pid,
    name: "تعارض اعتماد",
    members: [],
    manager_id: first.token,
    second_approver_id: same.token,
    inline_people: [first, same],
  });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.equal(await memberByPhone(a, "+966500000004"), null);
  assert.equal(
    (await a.DB.prepare("SELECT count(*) AS n FROM nl_otp").first()).n,
    0,
  );
  r = await a.req("committees/save", {
    project_id: pid,
    name: "لجنة إعادة الاستخدام",
    members: [
      { id: first.token, role: "member", grants: [] },
      { id: same.token, role: "supervisor", grants: [] },
    ],
    inline_people: [first, same],
  });
  ok(r);
  assert.equal(
    r.data.inline_people_resolved[first.token],
    r.data.inline_people_resolved[same.token],
  );
  const existing = await memberByPhone(a, "+966500000004");
  assert.equal(existing.name, first.name);
  assert.equal(
    JSON.parse((await row(a, "nl_committees", r.data.id)).members).length,
    1,
  );
  assert.equal(
    (await a.DB.prepare("SELECT count(*) AS n FROM nl_otp").first()).n,
    1,
  );
  const repeat = person(4, {
    phone: "٠٥٠٠٠٠٠٠٠٤",
    email: "ignored@example.test",
    name: "لا يستبدل الاسم",
  });
  r = await a.req("committees/save", {
    project_id: pid,
    name: "لجنة ثانية",
    members: [{ id: repeat.token, role: "member", grants: [] }],
    inline_people: [repeat],
  });
  ok(r);
  assert.equal(r.data.inline_people_resolved[repeat.token], existing.id);
  assert.equal((await row(a, "nl_members", existing.id)).name, first.name);
  assert.equal((await row(a, "nl_members", existing.id)).email, null);
});

test("inline validation, insufficient authority and stale saves create no orphan people", async () => {
  const a = await fixture();
  configure(a);
  const initial = await row(a, "nl_committees", a.cid);
  const restricted = await addMember(a, "inline-restricted", [
    { resource: "committees", action: "create", scope: "all", effect: "allow" },
  ]);
  const added = person(5);
  const create = {
    project_id: a.pid,
    name: "لجنة اختبار منع",
    members: [],
    manager_id: added.token,
    inline_people: [added],
  };
  assert.equal(
    (await a.req("committees/save", create, restricted)).status,
    403,
  );
  for (const invalid of [
    { ...added, phone: "bad" },
    { ...added, email: "invalid-email" },
    { ...added, name: "" },
  ])
    assert.equal(
      (await a.req("committees/save", { ...create, inline_people: [invalid] }))
        .status,
      400,
    );
  const stale = await a.req("committees/save", {
    ...create,
    id: a.cid,
    version: 0,
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(await memberByPhone(a, "+966500000005"), null);
  assert.deepEqual(await row(a, "nl_committees", a.cid), initial);
  assert.equal(
    (await a.DB.prepare("SELECT count(*) AS n FROM nl_otp").first()).n,
    0,
  );
  const unsupported = await a.req("projects/save", {
    project_id: a.pid,
    title: "wrong",
    inline_people: [added],
  });
  assert.equal(unsupported.status, 400);
  assert.equal(await memberByPhone(a, "+966500000005"), null);
});

test("inline task assignees and collaborators gain only committee access; stale task rolls back membership", async () => {
  const a = await fixture(),
    messages = configure(a),
    assignee = person(6),
    collaborator = person(7);
  const body = {
    ...taskBody(a),
    assignee_id: assignee.token,
    meta: { ...taskBody(a).meta, collaborators: [collaborator.token] },
    inline_people: [assignee, collaborator],
  };
  const saved = await a.req("tasks/save", body, owner, { key: "inline-task" });
  ok(saved);
  const t = await row(a, "nl_tasks", saved.data.id),
    committee = await row(a, "nl_committees", a.cid);
  assert.equal(
    t.assignee_id,
    saved.data.inline_people_resolved[assignee.token],
  );
  assert.deepEqual(JSON.parse(t.meta).collaborators, [
    saved.data.inline_people_resolved[collaborator.token],
  ]);
  for (const id of Object.values(saved.data.inline_people_resolved)) {
    const m = await row(a, "nl_members", id);
    assert.equal(m.grants, "[]");
    const link = JSON.parse(committee.members).find((x) => x.id === id);
    assert.equal(link.role, "member");
    assert.ok(link.grants.every((g) => g.assignedOnly));
  }
  const stalePerson = person(8);
  const stale = await a.req("tasks/save", {
    ...taskBody(a),
    id: t.id,
    version: 0,
    assignee_id: stalePerson.token,
    inline_people: [stalePerson],
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(await memberByPhone(a, "+966500000008"), null);
  assert.deepEqual(await row(a, "nl_committees", a.cid), committee);
  const replay = await a.req("tasks/save", body, owner, { key: "inline-task" });
  ok(replay);
  assert.deepEqual(replay.data, saved.data);
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 2);
  const code = messages
    .find((m) => m.chatId === "966500000007@c.us")
    .message.match(/\b[A-F0-9]{12}\b/)[0];
  const meta = JSON.parse(t.meta);
  meta.collaborators = [];
  await a.DB.prepare("UPDATE nl_tasks SET meta=? WHERE id=?")
    .bind(JSON.stringify(meta), t.id)
    .run();
  assert.equal(
    (await login(a, collaborator.phone, code)).status,
    400,
    "revoked participation invalidates its invitation",
  );
});

test("inline people in task support and comments become eligible participants", async () => {
  const a = await fixture(),
    messages = configure(a);
  const original = await a.req("tasks/save", {
    ...taskBody(a),
    assignee_id: a.member.memberId,
  });
  ok(original);
  const recipient = person(9);
  const requested = await a.req("tasks/request", {
    parent_id: original.data.id,
    recipient_id: recipient.token,
    title: "طلب مساندة",
    description: "مراجعة التجهيزات",
    kind: "person",
    inline_people: [recipient],
  });
  ok(requested);
  const support = await row(a, "nl_tasks", requested.data.id);
  assert.equal(support.parent_id, original.data.id);
  assert.equal(
    support.assignee_id,
    requested.data.inline_people_resolved[recipient.token],
  );
  const mentioned = person(10);
  const comment = await a.req("tasks/comment", {
    id: original.data.id,
    body: "يرجى متابعة التنسيق",
    mentions: [mentioned.token],
    inline_people: [mentioned],
  });
  ok(comment);
  const fresh = await row(a, "nl_tasks", original.data.id);
  assert.ok(
    JSON.parse(fresh.meta).collaborators.includes(
      comment.data.inline_people_resolved[mentioned.token],
    ),
  );
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 2);
});

test("inline asset custodian and advance recipient persist inside guarded movements", async () => {
  const a = await fixture(),
    messages = configure(a);
  const asset = await a.req("assets/save", {
    name: "خيمة اختبار",
    kind: "quantity",
    ownership: "owned",
    category: "معدات",
    quantity: 1,
    location: "المستودع",
    condition: "ready",
    meta: {},
  });
  ok(asset);
  const custodian = person(11);
  const issue = await a.req("assets/move", {
    id: asset.data.id,
    project_id: a.pid,
    member_id: custodian.token,
    type: "issue",
    quantity: 1,
    inline_people: [custodian],
  });
  ok(issue);
  const movement = await row(a, "nl_movements", issue.data.id);
  assert.equal(
    movement.member_id,
    issue.data.inline_people_resolved[custodian.token],
  );
  const denied = person(12);
  const noStock = await a.req("assets/move", {
    id: asset.data.id,
    project_id: a.pid,
    member_id: denied.token,
    type: "issue",
    quantity: 1,
    inline_people: [denied],
  });
  assert.equal(noStock.status, 409, JSON.stringify(noStock.data));
  assert.equal(await memberByPhone(a, "+966500000012"), null);
  const recipient = person(13),
    proof = await upload(a, "advances", "handover", owner, {
      project: a.pid,
      committee: a.cid,
    });
  const advance = await a.req("advances/create", {
    project_id: a.pid,
    committee_id: a.cid,
    assignee_id: recipient.token,
    title: "عهدة تجهيز",
    purpose: "تجهيز الموقع",
    amount: "25.50",
    date: "2027-01-10",
    reference: "TEST-ADVANCE",
    files: [proof],
    inline_people: [recipient],
  });
  ok(advance);
  assert.equal(
    (await row(a, "nl_advances", advance.data.id)).assignee_id,
    advance.data.inline_people_resolved[recipient.token],
  );
  assert.equal(
    (
      await a.DB.prepare(
        "SELECT amount FROM nl_advance_entries WHERE advance_id=?",
      )
        .bind(advance.data.id)
        .first()
    ).amount,
    2550,
  );
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 2);
});

test("inline proposed guide owner remains a proposal and failed delivery never duplicates", async () => {
  const a = await app(),
    messages = configure(a),
    pid = await addProject(a),
    proposed = person(14);
  const saved = await a.req("guides/save", {
    project_id: pid,
    title: "مسودة تنسيق",
    content: {
      sections: [{ title: "التجهيز", body: "نص تجريبي" }],
      assignee_id: proposed.token,
    },
    inline_people: [proposed],
  });
  ok(saved);
  const guide = await row(a, "nl_guides", saved.data.id);
  assert.equal(
    JSON.parse(guide.content).assignee_id,
    saved.data.inline_people_resolved[proposed.token],
  );
  assert.equal(
    (await a.DB.prepare("SELECT count(*) AS n FROM nl_tasks").first()).n,
    0,
  );
  let attempts = 0;
  a.env.PROVIDER_FETCH = async () => {
    attempts++;
    throw new Error("synthetic uncertain provider failure");
  };
  await dispatchNotifications(a.env);
  await dispatchNotifications(a.env);
  assert.equal(
    attempts,
    1,
    "uncertain delivery requires review rather than automatic resend",
  );
  assert.equal(messages.length, 0);
  assert.equal(
    (await a.DB.prepare("SELECT status FROM nl_delivery_jobs").first()).status,
    "needs_review",
  );
  assert.match(
    (
      await a.DB.prepare(
        "SELECT body FROM nl_notifications WHERE channel='whatsapp'",
      ).first()
    ).body,
    /ترشيح.*مسودة/,
  );
});

test("referrals cannot stage an arbitrary new supervisor", async () => {
  const a = await fixture();
  configure(a);
  const supervisor = person(15);
  const saved = await a.req("join-requests/forward", {
    id: crypto.randomUUID(),
    version: 1,
    supervisor_id: supervisor.token,
    inline_people: [supervisor],
  });
  assert.equal(saved.status, 400);
  assert.equal(await memberByPhone(a, "+966500000015"), null);
});

test("inline reuse respects suspended accounts, opt-outs and grant delegation boundaries", async () => {
  const a = await fixture();
  configure(a);
  const member = await addMember(a, "existing-inline", []);
  await a.DB.prepare(
    "UPDATE nl_members SET phone='+966500000016',status='suspended' WHERE id=?",
  )
    .bind(member.memberId)
    .run();
  const added = person(16);
  const body = {
    project_id: a.pid,
    name: "لجنة دعوة",
    members: [{ id: added.token, role: "member", grants: [] }],
    inline_people: [added],
  };
  assert.equal((await a.req("committees/save", body)).status, 400);
  await a.DB.prepare("UPDATE nl_members SET status='active' WHERE id=?")
    .bind(member.memberId)
    .run();
  await a.DB.prepare(
    "INSERT INTO nl_contact_preferences(member_id,whatsapp,consent_at) VALUES(?,0,?)",
  )
    .bind(member.memberId, new Date().toISOString())
    .run();
  assert.equal((await a.req("committees/save", body)).status, 400);
  assert.equal(
    (await a.DB.prepare("SELECT count(*) AS n FROM nl_otp").first()).n,
    0,
  );
  const narrow = await addMember(a, "narrow-inline", [
    { resource: "users", action: "manage", scope: "all", effect: "allow" },
    { resource: "committees", action: "create", scope: "all", effect: "allow" },
    { resource: "committees", action: "view", scope: "all", effect: "allow" },
  ]);
  const newManager = person(17);
  const denied = await a.req(
    "committees/save",
    {
      project_id: a.pid,
      name: "لا تفويض زائد",
      members: [],
      manager_id: newManager.token,
      inline_people: [newManager],
    },
    narrow,
  );
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  assert.equal(await memberByPhone(a, "+966500000017"), null);
});

test("inline subtask creation reserves a new ID and preserves its parent", async () => {
  const a = await fixture(),
    messages = configure(a);
  const created = await a.req("tasks/save", {
    ...taskBody(a),
    assignee_id: a.member.memberId,
  });
  ok(created);
  const parent = await row(a, "nl_tasks", created.data.id),
    assignee = person(18);
  const saved = await a.req("tasks/save", {
    ...taskBody(a),
    title: "مهمة فرعية جديدة",
    parent_id: parent.id,
    assignee_id: assignee.token,
    inline_people: [assignee],
  });
  ok(saved);
  assert.notEqual(saved.data.id, parent.id);
  const child = await row(a, "nl_tasks", saved.data.id);
  assert.equal(child.parent_id, parent.id);
  assert.equal(
    child.assignee_id,
    saved.data.inline_people_resolved[assignee.token],
  );
  assert.deepEqual(await row(a, "nl_tasks", parent.id), parent);
  const invitation = await a.DB.prepare(
    "SELECT * FROM nl_otp WHERE phone='+966500000018'",
  ).first();
  assert.equal(
    invitation.site_id,
    `person:${child.assignee_id}:tasks:${child.id}:assignee`,
  );
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 1);
});

test("closing a committee project invalidates sent passwords and stops queued invitations", async () => {
  const a = await fixture(),
    messages = configure(a),
    members = [person(19), person(20)];
  for (const [index, member] of members.entries()) {
    const saved = await a.req("committees/save", {
      project_id: a.pid,
      name: "Closure test " + index,
      members: [{ id: member.token, role: "supervisor", grants: [] }],
      inline_people: [member],
    });
    ok(saved);
    if (index === 0) {
      await dispatchNotifications(a.env);
      assert.equal(messages.length, 1);
    }
  }
  const code = messages[0].message.match(/\b[A-F0-9]{12}\b/)[0];
  await a.DB.prepare(
    "UPDATE nl_projects SET status='closed',version=version+1 WHERE id=?",
  )
    .bind(a.pid)
    .run();
  assert.equal((await login(a, members[0].phone, code)).status, 400);
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 1);
});

test("custody invitation login enforces explicit denies, project closure and outstanding asset custody", async () => {
  const a = await fixture(),
    messages = configure(a),
    custodian = person(21),
    recipient = person(22);
  const asset = await a.req("assets/save", {
    name: "أصل إرجاع تجريبي",
    kind: "quantity",
    ownership: "owned",
    category: "معدات",
    quantity: 1,
    location: "المستودع",
    condition: "ready",
  });
  ok(asset);
  const issue = await a.req("assets/move", {
    id: asset.data.id,
    project_id: a.pid,
    member_id: custodian.token,
    type: "issue",
    quantity: 1,
    inline_people: [custodian],
  });
  ok(issue);
  const proof = await upload(a, "advances", "handover", owner, {
    project: a.pid,
    committee: a.cid,
  });
  const advance = await a.req("advances/create", {
    project_id: a.pid,
    committee_id: a.cid,
    assignee_id: recipient.token,
    title: "عهدة منع وصول",
    purpose: "التجهيز",
    amount: "10.00",
    date: "2027-01-10",
    reference: "DENY-ADVANCE",
    files: [proof],
    inline_people: [recipient],
  });
  ok(advance);
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 2);
  const assetCode = messages
    .find((m) => m.chatId === "966500000021@c.us")
    .message.match(/\b[A-F0-9]{12}\b/)[0];
  const advanceCode = messages
    .find((m) => m.chatId === "966500000022@c.us")
    .message.match(/\b[A-F0-9]{12}\b/)[0];
  const custodianId = issue.data.inline_people_resolved[custodian.token],
    recipientId = advance.data.inline_people_resolved[recipient.token];
  for (const [id, resource] of [
    [custodianId, "assets"],
    [recipientId, "advances"],
  ])
    await a.DB.prepare(
      "UPDATE nl_members SET grants=?,version=version+1 WHERE id=?",
    )
      .bind(
        JSON.stringify([
          { resource, action: "view", effect: "deny", scope: "all" },
        ]),
        id,
      )
      .run();
  assert.equal((await login(a, custodian.phone, assetCode)).status, 400);
  assert.equal((await login(a, recipient.phone, advanceCode)).status, 400);
  for (const id of [custodianId, recipientId])
    await a.DB.prepare(
      "UPDATE nl_members SET grants='[]',version=version+1 WHERE id=?",
    )
      .bind(id)
      .run();
  await a.DB.prepare(
    "UPDATE nl_projects SET status='closed',version=version+1 WHERE id=?",
  )
    .bind(a.pid)
    .run();
  assert.equal((await login(a, custodian.phone, assetCode)).status, 400);
  assert.equal((await login(a, recipient.phone, advanceCode)).status, 400);
  await a.DB.prepare(
    "UPDATE nl_projects SET status='active',version=version+1 WHERE id=?",
  )
    .bind(a.pid)
    .run();
  ok(
    await a.req("assets/move", {
      id: asset.data.id,
      project_id: a.pid,
      member_id: custodianId,
      type: "return",
      quantity: 1,
    }),
  );
  assert.equal(
    (await login(a, custodian.phone, assetCode)).status,
    400,
    "historical custody alone cannot redeem an invitation",
  );
});

test("concurrent identical inline committees return the one committed mapping", async () => {
  const a = await fixture(),
    messages = configure(a),
    supervisor = person(23);
  // Hold both business batches after preflight to exercise replay in the commit
  // race, rather than merely hitting the early cached-receipt fast path.
  const sources = new WeakMap();
  let arrived = 0,
    release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  a.env.DB = {
    dialect: a.DB.dialect,
    prepare(sql) {
      const statement = a.DB.prepare(sql),
        bind = statement.bind;
      sources.set(statement, sql);
      statement.bind = (...args) => {
        const bound = bind(...args);
        sources.set(bound, sql);
        return bound;
      };
      return statement;
    },
    async batch(statements) {
      if (
        statements.some((s) =>
          /^INSERT INTO nl_receipts/.test(sources.get(s) || ""),
        )
      ) {
        arrived++;
        if (arrived === 2) release();
        await ready;
      }
      return a.DB.batch(statements);
    },
  };
  const body = {
    project_id: a.pid,
    name: "Concurrent committee",
    members: [{ id: supervisor.token, role: "supervisor", grants: [] }],
    inline_people: [supervisor],
  };
  const results = await Promise.all(
    [1, 2].map(() =>
      a.req("committees/save", body, owner, {
        key: "inline-referral-race",
      }),
    ),
  );
  assert.equal(arrived, 2);
  results.forEach(ok);
  assert.deepEqual(results[0].data, results[1].data);
  const member = await memberByPhone(a, "+966500000023");
  assert.equal(
    results[0].data.inline_people_resolved[supervisor.token],
    member.id,
  );
  assert.equal(
    JSON.parse((await row(a, "nl_committees", results[0].data.id)).members)[0]
      .id,
    member.id,
  );
  assert.equal(
    (
      await a.DB.prepare("SELECT count(*) AS n FROM nl_members WHERE phone=?")
        .bind(member.phone)
        .first()
    ).n,
    1,
  );
  assert.equal(
    (
      await a.DB.prepare("SELECT count(*) AS n FROM nl_otp WHERE phone=?")
        .bind(member.phone)
        .first()
    ).n,
    1,
  );
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 1);
});

test("leadership plus explicit custom membership preserves both roles and sends distinct notices with one credential", async () => {
  for (const [index, field] of [
    "manager_id",
    "second_approver_id",
    "review_delegate_id",
  ].entries()) {
    const a = await app(),
      messages = configure(a),
      pid = await addProject(a),
      added = person(30 + index);
    const title = "منسق الضيافة والموقع";
    const body = {
      project_id: pid,
      name: "لجنة الأدوار المتعددة",
      [field]: added.token,
      members: [
        {
          id: added.token,
          role: "member",
          title,
          grants: [{ resource: "tasks", action: "export", effect: "deny" }],
        },
      ],
      inline_people: [added],
    };
    const saved = await a.req("committees/save", body, owner, {
      key: "two-roles-" + field,
    });
    ok(saved);
    const memberId = saved.data.inline_people_resolved[added.token],
      member = await row(a, "nl_members", memberId);
    const committee = await row(a, "nl_committees", saved.data.id),
      memberships = JSON.parse(committee.members);
    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].role, "member");
    assert.equal(memberships[0].title, title);
    assert.equal(member.grants, "[]");
    assert.equal(member.bundles, "[]");
    const recipient = withCommittees(member, [committee]);
    const expense = {
      project_id: pid,
      committee_id: committee.id,
      created_by: "another-person",
    };
    const task = {
      project_id: pid,
      assignee_id: memberId,
      meta: JSON.stringify({ committee_id: committee.id }),
    };
    assert.equal(
      permitted(recipient, "expenses", "approve", expense, []),
      true,
    );
    assert.equal(permitted(recipient, "tasks", "edit", task, []), true);
    assert.equal(
      permitted(recipient, "tasks", "export", task, []),
      false,
      "explicit deny survives grant union",
    );
    const notices = (
      await a.DB.prepare(
        "SELECT * FROM nl_notifications WHERE member_id=? AND channel='whatsapp'",
      )
        .bind(memberId)
        .all()
    ).results;
    assert.equal(notices.length, 2);
    assert.equal(new Set(notices.map((n) => n.title)).size, 2);
    assert.equal(notices.filter((n) => n.title.includes(title)).length, 1);
    assert.equal(
      (
        await a.DB.prepare("SELECT count(*) AS n FROM nl_otp WHERE phone=?")
          .bind(member.phone)
          .first()
      ).n,
      1,
    );
    const replay = await a.req("committees/save", body, owner, {
      key: "two-roles-" + field,
    });
    ok(replay);
    assert.deepEqual(replay.data, saved.data);
    await dispatchNotifications(a.env);
    assert.equal(messages.length, 2);
    const passwords = messages.map(
      (m) => m.message.match(/\b[A-F0-9]{12}\b/)[0],
    );
    assert.equal(
      new Set(passwords).size,
      1,
      "role notices share a single one-use credential",
    );
    await dispatchNotifications(a.env);
    assert.equal(messages.length, 2);
    assert.equal((await login(a, added.phone, passwords[0])).status, 200);
    assert.equal((await login(a, added.phone, passwords[1])).status, 400);
    const edited = await a.req("committees/save", {
      id: committee.id,
      version: committee.version,
      project_id: pid,
      name: "اسم لجنة محدث",
      members: memberships,
    });
    ok(edited);
    await dispatchNotifications(a.env);
    assert.equal(
      messages.length,
      2,
      "ordinary editing does not repeat assignment notices",
    );
  }
});

test("explicit manager membership is distinct from leadership; revoked roles do not send stale notices", async () => {
  const a = await app(),
    messages = configure(a),
    pid = await addProject(a),
    added = person(34);
  const saved = await a.req("committees/save", {
    project_id: pid,
    name: "لجنة إشعار الأدوار",
    manager_id: added.token,
    members: [{ id: added.token, role: "manager", grants: [] }],
    inline_people: [added],
  });
  ok(saved);
  const id = saved.data.inline_people_resolved[added.token],
    committee = await row(a, "nl_committees", saved.data.id);
  const invite = await a.DB.prepare(
    "SELECT * FROM nl_otp WHERE phone='+966500000034'",
  ).first();
  assert.match(invite.site_id, /:manager\+membership_manager$/);
  assert.equal(
    (
      await a.DB.prepare(
        "SELECT count(*) AS n FROM nl_notifications WHERE member_id=? AND channel='whatsapp'",
      )
        .bind(id)
        .first()
    ).n,
    2,
  );
  await a.DB.prepare(
    "UPDATE nl_committees SET manager_id=NULL,version=version+1 WHERE id=?",
  )
    .bind(committee.id)
    .run();
  await dispatchNotifications(a.env);
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /عضو اللجنة بصفة مدير/);
  const password = messages[0].message.match(/\b[A-F0-9]{12}\b/)[0];
  assert.equal(
    (await login(a, added.phone, password)).status,
    200,
    "retained explicit membership remains eligible",
  );
  assert.equal((await login(a, added.phone, password)).status, 400);
});

test("historical referral invitations require the current committee manager", async () => {
  const a = await fixture(),
    application = crypto.randomUUID(),
    timestamp = new Date().toISOString();
  const member = await row(a, "nl_members", a.outsider.memberId);
  await a.DB.prepare(
    "INSERT INTO nl_join_requests(id,name,phone,reason,committee_id,status,assigned_to,policy_version,policy_snapshot,consent_at,verified_at,created,updated) VALUES(?,?,?,?,?,'referred',?,0,'{}',?,?,?,?)",
  )
    .bind(
      application,
      "Historical referral test",
      "+966500000091",
      "Test participation",
      a.cid,
      member.id,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
  const committee = await row(a, "nl_committees", a.cid),
    members = JSON.parse(committee.members);
  members.push({ id: member.id, role: "supervisor", grants: [] });
  await a.DB.prepare("UPDATE nl_committees SET members=? WHERE id=?")
    .bind(JSON.stringify(members), a.cid)
    .run();
  const invite = {
    id: crypto.randomUUID(),
    site_id: `person:${member.id}:join_requests:${application}:supervisor`,
    phone: member.phone,
    used: 0,
    expires: Date.now() + 60000,
  };
  assert.equal(await personInvitationEligible(a.DB, invite, member), false);
  await a.DB.prepare("UPDATE nl_committees SET manager_id=? WHERE id=?")
    .bind(member.id, a.cid)
    .run();
  assert.equal(await personInvitationEligible(a.DB, invite, member), true);
  assert.equal(
    await personInvitationEligible(
      a.DB,
      { ...invite, site_id: `person:${member.id}` },
      member,
    ),
    false,
  );
});

test("delayed role notices survive consumed or expired credentials without exposing an unusable password", async () => {
  for (const scenario of ["consumed", "expired"]) {
    const a = await app(),
      messages = configure(a),
      pid = await addProject(a),
      added = person(35);
    const saved = await a.req("committees/save", {
      project_id: pid,
      name: "لجنة إشعار مؤجل",
      manager_id: added.token,
      members: [
        { id: added.token, role: "member", title: "منسق الموقع", grants: [] },
      ],
      inline_people: [added],
    });
    ok(saved);
    const member = await row(
      a,
      "nl_members",
      saved.data.inline_people_resolved[added.token],
    );
    const invite = await a.DB.prepare("SELECT * FROM nl_otp WHERE phone=?")
      .bind(member.phone)
      .first();
    if (scenario === "consumed") {
      await dispatchNotifications(a.env, invite.id);
      assert.equal(messages.length, 1);
      const password = messages[0].message.match(/\b[A-F0-9]{12}\b/)[0];
      assert.equal((await login(a, added.phone, password)).status, 200);
      await dispatchNotifications(a.env);
      assert.equal(messages.length, 2);
      assert.doesNotMatch(messages[1].message, /\b[A-F0-9]{12}\b/);
      assert.match(messages[1].message, /منسق الموقع/);
      assert.equal((await login(a, added.phone, password)).status, 400);
    } else {
      await a.DB.prepare("UPDATE nl_otp SET expires=0 WHERE id=?")
        .bind(invite.id)
        .run();
      await dispatchNotifications(a.env);
      assert.equal(messages.length, 2);
      for (const message of messages)
        assert.doesNotMatch(message.message, /\b[A-F0-9]{12}\b/);
    }
    const fresh = await row(a, "nl_otp", invite.id);
    assert.equal(
      await personInvitationEligible(a.DB, fresh, member),
      false,
      "authentication still requires a current unused credential",
    );
    assert.equal(
      await personInvitationEligible(a.DB, fresh, member, [], {
        credentialRequired: false,
      }),
      true,
    );
    await a.DB.prepare(
      "UPDATE nl_committees SET manager_id=NULL,members='[]',version=version+1 WHERE id=?",
    )
      .bind(saved.data.id)
      .run();
    assert.equal(
      await personInvitationEligible(a.DB, fresh, member, [], {
        credentialRequired: false,
      }),
      false,
      "notice eligibility still requires a current role",
    );
    await dispatchNotifications(a.env);
    assert.equal(messages.length, 2);
  }
});
