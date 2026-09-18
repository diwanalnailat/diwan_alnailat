import assert from "node:assert/strict";
import fs from "node:fs";
import worker, { money, permitted } from "../worker.js";
import { DEFAULT_SETTINGS } from "../lib/domain.js";
import { database } from "../scripts/sqlite.mjs";
const origin = "https://diwan.test";
export const owner = { id: "site-owner", email: "owner@example.test" };
export const full = [
  { resource: "*", action: "*", scope: "all", effect: "allow" },
];
export async function app() {
  const DB = database();
  for (const f of fs
    .readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await DB.exec(fs.readFileSync("drizzle/" + f, "utf8"));
  const objects = new Map(),
    BUCKET = {
      put: async (k, b) => objects.set(k, b),
      get: async (k) => (objects.has(k) ? { body: objects.get(k) } : null),
      delete: async (k) => objects.delete(k),
    };
  const env = { DB, BUCKET, SITE_OWNER_EMAIL: owner.email };
  return {
    DB,
    env,
    objects,
    async req(path, body, as = owner, opts = {}) {
      const headers = {
        ...(as
          ? {
              "oai-authenticated-user-id": as.id,
              "oai-authenticated-user-email": as.email,
            }
          : {}),
        origin: opts.origin || origin,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.key ? { "Idempotency-Key": opts.key } : {}),
      };
      const response = await worker.fetch(
        new Request(origin + "/api/" + path, {
          method: body !== undefined ? "POST" : "GET",
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
        env,
      );
      return { status: response.status, data: await response.json() };
    },
  };
}
const project = {
  title: "مشروع اختبار",
  description: "تجهيز فعالية",
  season: "2027",
  status: "active",
  start: "2027-01-01",
  due: "2027-02-01",
  budget: "10000",
  sections: ["التشغيل"],
};
export async function addProject(a, title = project.title) {
  const r = await a.req("projects/save", { ...project, title });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
}
export async function addMember(a, name, grants = full) {
  const r = await a.req("users/save", {
    name,
    email: name + "@example.test",
    status: "active",
    grants,
    bundles: [],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await a.DB.prepare("UPDATE nl_members SET site_id=? WHERE id=?")
    .bind(name, r.data.id)
    .run();
  return { id: name, email: name + "@example.test", memberId: r.data.id };
}
const task = (p, title = "تجهيز الخيام") => ({
  project_id: p,
  title,
  description: "تفاصيل التنفيذ",
  priority: "high",
  status: "todo",
  due: "2027-01-20",
  meta: { checklist: [], collaborators: [], dependencies: [] },
});
const expense = (p) => ({
  project_id: p,
  title: "تجهيزات",
  number: "INV-001",
  category: "التجهيزات",
  amount: "115.50",
  tax: "15.50",
  date: "2027-01-10",
  status: "pending",
});
export async function upload(a, resource, purpose, as = owner, extra = {}) {
  const fd = new FormData();
  fd.set(
    "file",
    new File(["%PDF-1.7\nproof"], "proof.pdf", { type: "application/pdf" }),
  );
  fd.set("resource", resource);
  fd.set("purpose", purpose);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  const response = await worker.fetch(
    new Request(origin + "/api/upload", {
      method: "POST",
      headers: {
        origin,
        "oai-authenticated-user-id": as.id,
        "oai-authenticated-user-email": as.email,
      },
      body: fd,
    }),
    a.env,
  );
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data.id;
}
export async function fixture() {
  const a = await app(),
    manager = await addMember(a, "manager", []),
    member = await addMember(a, "worker", []),
    outsider = await addMember(a, "outsider", []);
  let r = await a.req("projects/save", { ...project, supervisor_id: "owner" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const pid = r.data.id;
  r = await a.req("committees/save", {
    project_id: pid,
    name: "الضيافة",
    description: "خدمة الضيوف",
    manager_id: manager.memberId,
    second_approver_id: "owner",
    members: [
      { id: manager.memberId, role: "manager", grants: [] },
      {
        id: member.memberId,
        role: "member",
        grants: [
          {
            resource: "tasks",
            action: "view",
            effect: "allow",
            assignedOnly: true,
          },
          {
            resource: "tasks",
            action: "edit",
            effect: "allow",
            assignedOnly: true,
          },
        ],
      },
    ],
    config: {
      tags: ["ميداني"],
      budgetLines: [
        {
          id: "hospitality",
          name: "ضيافة وتموين",
          budget: "10000",
          active: true,
        },
      ],
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const cid = r.data.id;
  return { ...a, pid, cid, manager, member, outsider };
}
export async function saveTask(a, override = {}) {
  const r = await a.req(
    "tasks/save",
    {
      ...task(a.pid),
      assignee_id: a.member.memberId,
      meta: {
        committee_id: a.cid,
        type: "execution",
        outcome: "اكتمال التجهيز",
        tags: ["ميداني"],
        ...override.meta,
      },
      ...Object.fromEntries(
        Object.entries(override).filter(([k]) => k !== "meta"),
      ),
    },
    a.manager,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
}
export async function state(a, as = owner) {
  const r = await a.req("state", undefined, as);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
export async function saveExpense(a, override = {}) {
  const files = await upload(a, "expenses", "invoice", a.member, {
    project: a.pid,
    committee: a.cid,
  });
  const r = await a.req(
    "expenses/save",
    {
      ...expense(a.pid),
      committee_id: a.cid,
      budget_line_id: "hospitality",
      funding_source: "personal",
      files: [files],
      ...override,
    },
    a.member,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
}
export async function review(a, id, as) {
  const e = (await state(a)).expenses.find((e) => e.id === id);
  return a.req(
    "expenses/review",
    { id, version: e.version, decision: "approve" },
    as,
  );
}
