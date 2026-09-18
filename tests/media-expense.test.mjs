import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, state, saveTask, upload, addMember } from "./support.mjs";
test("durable media profiles, supplier map and authorized archive export", async () => {
  const a = await fixture();
  try {
    const file = await upload(a, "suppliers", "supplier");
    const payload = {
      name: "إعلامي اختبار",
      entity_type: "individual",
      category: "العلاقات الإعلامية",
      site_location: { label: "المكتب", lat: 24.7, lng: 46.6 },
      files: [file],
      media_profile: {
        role: "إعلامي",
        specialty: "تغطية المهرجانات",
        accounts: [
          {
            platform: "X",
            handle: "test",
            url: "https://x.com/test",
            followers: 50000,
            observed_on: "2026-09-15",
          },
        ],
        engagements: [
          {
            project_id: a.pid,
            date: "2027-01-10",
            title: "تغطية الضيافة",
            description: "تقرير مصور",
            status: "موثق ومؤرشف",
            file_ids: [file],
            url: "https://example.com/work",
            views: 1500,
            interactions: 50,
          },
        ],
      },
    };
    let r = await a.req("suppliers/save", payload);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const id = r.data.id;
    let s = (await state(a)).suppliers.find((s) => s.id === id);
    assert.equal(s.meta.site_location.lat, 24.7);
    assert.equal(s.meta.media_profile.accounts[0].followers, 50000);
    assert.equal(s.meta.media_profile.engagements[0].file_ids[0], file);
    r = await a.req("suppliers/save", {
      ...payload,
      id,
      version: s.version,
      files: [],
      media_profile: {
        ...s.meta.media_profile,
        engagements: [
          ...s.meta.media_profile.engagements,
          {
            project_id: a.pid,
            date: "2027-01-11",
            title: "زيارة ثانية",
            status: "حضر",
            file_ids: [],
          },
        ],
      },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    s = (await state(a)).suppliers.find((s) => s.id === id);
    assert.equal(s.meta.media_profile.engagements.length, 2);
    r = await a.req("export?type=media");
    assert.equal(r.status, 200);
    assert.equal(r.data.rows.length, 2);
    r = await a.req("export?type=media", undefined, a.outsider);
    assert.equal(r.status, 403);
    r = await a.req("suppliers/save", {
      ...payload,
      id,
      version: s.version,
      files: [],
      media_profile: {
        ...s.meta.media_profile,
        accounts: [{ platform: "X", url: "javascript:alert(1)" }],
      },
    });
    assert.equal(r.status, 400);
  } finally {
    a.DB.close();
  }
});
test("expense task must be assigned, and foreign committee cannot be selected by ordinary claimant", async () => {
  const a = await fixture();
  try {
    const t = await saveTask(a, { assignee_id: a.manager.memberId });
    const grants = [
      { resource: "tasks", action: "view", effect: "allow", scope: "all" },
      { resource: "expenses", action: "create", effect: "allow", scope: "all" },
    ];
    const u = await addMember(a, "claimant", grants);
    const file = await upload(a, "expenses", "invoice", u, {
      project: a.pid,
      committee: a.cid,
    });
    const payload = {
      project_id: a.pid,
      committee_id: a.cid,
      budget_line_id: "hospitality",
      title: "اختبار",
      amount: "10",
      tax: "0",
      date: "2027-01-10",
      status: "draft",
      funding_source: "personal",
      files: [file],
    };
    let r = await a.req("expenses/save", payload, u);
    assert.equal(r.status, 403, JSON.stringify(r.data));
    const r2 = await a.req(
      "expenses/save",
      { ...payload, files: [], task_id: t },
      a.member,
    );
    assert.equal(r2.status, 403, JSON.stringify(r2.data));
  } finally {
    a.DB.close();
  }
});
