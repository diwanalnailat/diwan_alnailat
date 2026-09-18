import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import {
  fixture,
  saveTask,
  saveExpense,
  review,
  upload,
  state,
  owner,
  addMember,
} from "./support.mjs";
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.data));
test("committee task: fixed checklist, assignee visibility, ordered completion and manager approval", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a);
    let t = (await state(a, a.member)).tasks.find((t) => t.id === id);
    assert.equal(t.meta.checklist.length, 3);
    assert.equal(t.meta.reviewer_id, a.manager.memberId);
    assert.equal((await state(a, a.outsider)).tasks.length, 0);
    assert.equal(
      (
        await a.req(
          "tasks/transition",
          { id, version: t.version, status: "done" },
          a.member,
        )
      ).status,
      400,
    );
    ok(
      await a.req(
        "tasks/transition",
        { id, version: t.version, status: "doing" },
        a.member,
      ),
    );
    t = (await state(a)).tasks.find((t) => t.id === id);
    assert.equal(
      (
        await a.req(
          "tasks/transition",
          { id, version: t.version, status: "review", note: "تم" },
          a.member,
        )
      ).status,
      400,
    );
    for (const step of t.meta.checklist) {
      ok(
        await a.req(
          "tasks/checklist",
          { id, item_id: step.id, done: true, version: t.version },
          a.member,
        ),
      );
      t = (await state(a)).tasks.find((t) => t.id === id);
    }
    const proof = await upload(a, "tasks", "proof", a.member, {
      entity: id,
      attach_later: "true",
    });
    ok(
      await a.req(
        "tasks/transition",
        {
          id,
          version: t.version,
          status: "review",
          note: "تم تجهيز الضيافة",
          files: [proof],
        },
        a.member,
      ),
    );
    t = (await state(a)).tasks.find((t) => t.id === id);
    assert.equal(
      (
        await a.req(
          "tasks/transition",
          { id, version: t.version, status: "done" },
          owner,
        )
      ).status,
      403,
    );
    ok(
      await a.req(
        "tasks/transition",
        { id, version: t.version, status: "done" },
        a.manager,
      ),
    );
    const st = await state(a, a.member);
    assert.equal(st.tasks[0].status, "done");
    assert.ok(st.notifications.some((n) => n.title.includes("اعتُمد")));
    assert.ok(
      st.files.some((f) => f.id === proof && f.meta.purpose === "proof"),
    );
    assert.equal(
      (await a.req("tasks/save", { ...st.tasks[0], status: "todo" }, a.manager))
        .status,
      400,
    );
  } finally {
    a.DB.close();
  }
});
test("conversation: scoped mentions, replies, staged attachments and durable outbox without fake WhatsApp delivery", async () => {
  const a = await fixture();
  try {
    const id = await saveTask(a);
    const file = await upload(a, "tasks", "comment", a.member, {
      entity: id,
      attach_later: "true",
    });
    let r = await a.req(
      "tasks/comment",
      {
        id,
        body: "أحتاج توضيح العدد",
        mentions: [a.manager.memberId],
        files: [file],
      },
      a.member,
    );
    ok(r);
    const commentId = r.data.id;
    ok(
      await a.req(
        "tasks/comment",
        { id, body: "العدد موضح في المرجع", reply_to: commentId },
        a.manager,
      ),
    );
    assert.equal(
      (
        await a.req(
          "tasks/comment",
          { id, body: "معلومة", mentions: [a.outsider.memberId] },
          a.member,
        )
      ).status,
      400,
    );
    const t = await a.req("tasks/" + id, undefined, a.member);
    ok(t);
    assert.equal(t.data.comments.length, 2);
    assert.equal(JSON.parse(t.data.comments[1].meta).reply_to, commentId);
    assert.ok(t.data.files.some((f) => f.id === file));
    const ns = await a.DB.prepare(
      "SELECT * FROM nl_notifications WHERE channel='whatsapp'",
    ).all();
    assert.ok(ns.results.length);
    assert.ok(
      ns.results.every((n) => n.status !== "sent" && n.status !== "delivered"),
    );
  } finally {
    a.DB.close();
  }
});
test("expenses: committee context, controlled budget lines, receipt required, two distinct approvers and pending reimbursement", async () => {
  const a = await fixture();
  try {
    const basic = {
      project_id: a.pid,
      committee_id: a.cid,
      budget_line_id: "hospitality",
      title: "ضيافة",
      amount: "115.50",
      tax: "15.50",
      date: "2027-01-10",
      funding_source: "personal",
      status: "pending",
    };
    assert.equal((await a.req("expenses/save", basic, a.member)).status, 400);
    assert.equal(
      (
        await a.req(
          "expenses/save",
          { ...basic, status: "draft", budget_line_id: "freeform" },
          a.member,
        )
      ).status,
      400,
    );
    const id = await saveExpense(a, {
      route: [a.member.memberId],
      amount: "115.50",
    });
    let e = (await state(a)).expenses.find((e) => e.id === id);
    assert.deepEqual(e.meta.route, [a.manager.memberId, "owner"]);
    assert.equal(e.meta.claimant_id, a.member.memberId);
    assert.equal((await review(a, id, owner)).status, 403);
    ok(await review(a, id, a.manager));
    e = (await state(a)).expenses.find((e) => e.id === id);
    assert.equal(e.status, "pending");
    assert.equal(e.paid, 0);
    assert.equal(e.meta.approvalIndex, 1);
    assert.equal((await review(a, id, a.manager)).status, 403);
    ok(await review(a, id, owner));
    e = (await state(a)).expenses.find((e) => e.id === id);
    assert.equal(e.status, "approved");
    assert.equal(e.paid, 0);
    assert.equal(e.meta.settlement, "owed_to_member");
    assert.equal(
      (
        await a.req("expenses/pay", {
          id,
          amount: "100",
          date: "2027-01-11",
          reference: "T1",
        })
      ).status,
      400,
    );
    const file = await upload(a, "expenses", "reimbursement", owner, {
      entity: id,
      attach_later: "true",
    });
    ok(
      await a.req(
        "expenses/pay",
        {
          id,
          amount: "100",
          date: "2027-01-11",
          reference: "T1",
          files: [file],
        },
        owner,
        { key: "payment-request-00001" },
      ),
    );
    ok(
      await a.req(
        "expenses/pay",
        {
          id,
          amount: "100",
          date: "2027-01-11",
          reference: "T1",
          files: [file],
        },
        owner,
        { key: "payment-request-00001" },
      ),
    );
    e = (await state(a)).expenses.find((e) => e.id === id);
    assert.equal(e.paid, 10000);
    const bad = await upload(a, "expenses", "reimbursement", owner, {
      entity: id,
      attach_later: "true",
    });
    assert.equal(
      (
        await a.req("expenses/pay", {
          id,
          amount: "16",
          date: "2027-01-11",
          reference: "T2",
          files: [bad],
        })
      ).status,
      409,
    );
    assert.equal((await state(a, a.member)).expenses[0].paid, 10000);
  } finally {
    a.DB.close();
  }
});
test("advance settlement: automatic only after final approval, exact balance, atomic no-overdraw and complete export", async () => {
  const a = await fixture();
  try {
    const proof = await upload(a, "advances", "handover", owner, {
      project: a.pid,
    });
    let r = await a.req("advances/create", {
      project_id: a.pid,
      committee_id: a.cid,
      assignee_id: a.member.memberId,
      title: "عهدة الضيافة",
      purpose: "تشغيل الضيافة",
      amount: "500",
      date: "2027-01-01",
      reference: "FUND1",
      files: [proof],
    });
    ok(r);
    const aid = r.data.id;
    const e1 = await saveExpense(a, {
      amount: "300",
      tax: 0,
      funding_source: "advance",
      advance_id: aid,
    });
    const e2 = await saveExpense(a, {
      amount: "300",
      tax: 0,
      number: "INV-2",
      funding_source: "advance",
      advance_id: aid,
    });
    ok(await review(a, e1, a.manager));
    ok(await review(a, e2, a.manager));
    assert.equal((await state(a, a.member)).advances[0].balance, 50000);
    ok(await review(a, e1, owner));
    let st = await state(a, a.member);
    assert.equal(st.advances[0].balance, 20000);
    assert.equal(st.advances[0].settled, 30000);
    assert.equal(st.expenses.find((e) => e.id === e1).paid, 30000);
    assert.equal((await review(a, e2, owner)).status, 409);
    st = await state(a);
    assert.equal(st.advances[0].balance, 20000);
    assert.equal(st.expenses.find((e) => e.id === e2).status, "pending");
    assert.equal(st.payments.length, 1);
    r = await a.req("export?type=advances&ids=" + aid);
    ok(r);
    assert.equal(r.data.advanceEntries.length, 2);
    assert.equal(r.data.linkedExpenses.length, 2);
    assert.equal((await state(a, a.outsider)).advances.length, 0);
    const file = await upload(a, "advances", "handover", owner, {
      entity: aid,
      attach_later: "true",
    });
    ok(
      await a.req("advances/entry", {
        id: aid,
        type: "return",
        amount: "200",
        date: "2027-02-01",
        reference: "RET1",
        files: [file],
      }),
    );
    assert.equal((await state(a)).advances[0].balance, 0);
  } finally {
    a.DB.close();
  }
});
test("membership assignment updates leadership, explicit denies hide records, annual clone resets people and finance", async () => {
  const a = await fixture();
  try {
    const newcomer = await addMember(a, "newmanager", []);
    const m = (await state(a)).members.find((m) => m.id === newcomer.memberId);
    ok(
      await a.req("users/save", {
        ...m,
        memberships: [{ committee_id: a.cid, role: "manager" }],
      }),
    );
    let st = await state(a);
    assert.equal(st.committees[0].manager_id, newcomer.memberId);
    assert.ok(st.committees[0].members.some((x) => x.id === newcomer.memberId));
    assert.equal(
      (
        await a.req(
          "tasks/save",
          {
            project_id: a.pid,
            title: "محاولة إسناد",
            meta: { committee_id: a.cid },
          },
          a.manager,
        )
      ).status,
      403,
    );
    const r = await a.req("projects/clone", {
      id: a.pid,
      title: "المشاركة الجديدة",
      season: "2028",
      start: "2028-01-01",
      due: "2028-02-01",
    });
    ok(r);
    st = await state(a);
    const clone = st.committees.find((c) => c.project_id === r.data.id);
    assert.equal(clone.members.length, 0);
    assert.equal(clone.manager_id, null);
    assert.equal(clone.config.budgetLines[0].name, "ضيافة وتموين");
    assert.equal(clone.config.budgetLines[0].budget, 0);
    assert.equal(
      st.projects.find((p) => p.id === r.data.id).meta.supervisor_id,
      null,
    );
    assert.equal(st.tasks.filter((t) => t.project_id === r.data.id).length, 0);
  } finally {
    a.DB.close();
  }
});
test("supplier and asset metadata: protected banking/docs, rental completeness and file access revocation", async () => {
  const a = await fixture();
  try {
    const file = await upload(a, "suppliers", "supplier");
    let r = await a.req("suppliers/save", {
      name: "مورد الخيام",
      category: "الخيام والكرفانات",
      phone: "+966500000001",
      email: "supplier@example.test",
      tax_number: "300000000000003",
      iban: "SA0380000000608010167519",
      contact_name: "خالد",
      city: "الرياض",
      files: [file],
    });
    ok(r);
    const supplierId = r.data.id;
    assert.equal((await state(a, a.member)).suppliers.length, 0);
    await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
      .bind(
        JSON.stringify([
          {
            resource: "suppliers",
            action: "view",
            effect: "allow",
            scope: "all",
          },
        ]),
        a.member.memberId,
      )
      .run();
    assert.equal((await state(a, a.member)).suppliers[0].meta.iban, undefined);
    const f = await worker.fetch(
      new Request("https://diwan.test/api/files/" + file, {
        headers: {
          "oai-authenticated-user-id": a.member.id,
          "oai-authenticated-user-email": a.member.email,
        },
      }),
      a.env,
    );
    assert.equal(f.status, 403);
    assert.equal(
      (
        await a.req("assets/save", {
          name: "خيمة مستأجرة",
          quantity: 2,
          ownership: "rented",
        })
      ).status,
      400,
    );
    r = await a.req("assets/save", {
      name: "خيمة كبيرة",
      quantity: 2,
      ownership: "rented",
      kind: "quantity",
      supplier_id: supplierId,
      unit_value: "5000",
      rental_total: "1000",
      rental_start: "2027-01-01",
      rental_end: "2027-02-01",
      deposit: "500",
    });
    ok(r);
    const asset = (await state(a)).assets[0];
    assert.equal(asset.meta.unit_value, 500000);
    assert.equal(asset.meta.deposit, 50000);
    const id = await saveTask(a);
    const proof = await upload(a, "tasks", "guide", a.member, {
      entity: id,
      attach_later: "true",
    });
    const task = (await state(a)).tasks.find((t) => t.id === id);
    ok(await a.req("tasks/save", { ...task, files: [proof] }, a.member));
    let m = (await state(a)).members.find((m) => m.id === a.member.memberId);
    ok(
      await a.req("users/save", {
        ...m,
        grants: [
          { resource: "tasks", action: "view", effect: "deny", scope: "all" },
        ],
      }),
    );
    assert.equal((await a.req("tasks/" + id, undefined, a.member)).status, 403);
    assert.equal(
      (await state(a, a.member)).files.some((f) => f.id === proof),
      false,
    );
  } finally {
    a.DB.close();
  }
});
