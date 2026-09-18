import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker, { money, permitted } from "../worker.js";
import { DEFAULT_SETTINGS } from "../lib/domain.js";
import { database } from "../scripts/sqlite.mjs";
const origin = "https://diwan.test";
const owner = { id: "site-owner", email: "owner@example.test" };
const full = [{ resource: "*", action: "*", scope: "all", effect: "allow" }];
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
async function addProject(a, title = project.title) {
  const r = await a.req("projects/save", { ...project, title });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.id;
}
async function addMember(a, name, grants = full) {
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
test("exact money; scoped grants, expiry and explicit deny", () => {
  assert.equal(money("123.45"), 12345);
  for (const v of ["1.234", "-1", "Infinity", "0", "1e5"])
    assert.throws(() => money(v));
  const u = {
    id: "m",
    status: "active",
    bundles: [],
    grants: [
      { resource: "tasks", action: "view", effect: "allow", scope: "assigned" },
      {
        resource: "tasks",
        action: "edit",
        effect: "allow",
        scope: "project",
        projectId: "p",
      },
      {
        resource: "tasks",
        action: "edit",
        effect: "deny",
        scope: "project",
        projectId: "blocked",
      },
      {
        resource: "expenses",
        action: "view",
        effect: "allow",
        expires: "2020-01-01",
      },
    ],
  };
  assert.equal(permitted(u, "tasks", "view", { assignee_id: "m" }), true);
  assert.equal(permitted(u, "tasks", "view", { assignee_id: "other" }), false);
  assert.equal(permitted(u, "tasks", "edit", { project_id: "p" }), true);
  assert.equal(permitted(u, "tasks", "edit", { project_id: "blocked" }), false);
  assert.equal(permitted(u, "expenses", "view"), false);
  assert.equal(
    permitted({ ...u, status: "suspended" }, "tasks", "view", {
      assignee_id: "m",
    }),
    false,
  );
});
test("trusted sign-in, origin checks, providers deferred and durable owner bootstrap", async () => {
  const a = await app();
  assert.equal((await a.req("state", undefined, null)).status, 401);
  assert.equal(
    (
      await a.req("state", undefined, {
        id: "foreign",
        email: "foreign@test.com",
      })
    ).status,
    403,
  );
  const st = await a.req("state");
  assert.equal(st.status, 200, JSON.stringify(st.data));
  assert.equal(st.data.user.id, "owner");
  assert.equal(
    (
      await a.req("projects/save", project, owner, {
        origin: "https://evil.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (await a.req("auth/request", { phone: "+966500000000" })).status,
    503,
  );
  assert.equal((await a.req("agent/ask", { message: "حلل" })).status, 503);
  assert.equal((await a.req("state")).data.members.length, 1);
  a.DB.close();
});
test("asset movements are atomic and balances cannot go negative or over-return", async () => {
  const a = await app();
  await a.req("state");
  let r = await a.req("assets/save", {
    name: "خيام",
    kind: "quantity",
    ownership: "owned",
    quantity: 10,
    condition: "ready",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.id,
    b = { id, type: "issue", quantity: 7, member_id: "owner" };
  assert.equal(
    (await a.req("assets/move", b, owner, { key: "asset-move-key" })).status,
    200,
  );
  assert.equal(
    (await a.req("assets/move", b, owner, { key: "asset-move-key" })).status,
    200,
  );
  assert.equal((await a.req("assets/move", { ...b, quantity: 4 })).status, 409);
  assert.equal(
    (await a.req("assets/move", { ...b, type: "return", quantity: 8 })).status,
    409,
  );
  assert.equal(
    (await a.req("assets/move", { ...b, type: "return", quantity: 2 })).status,
    200,
  );
  const st = (await a.req("state")).data;
  assert.equal(st.assets[0].available, 5);
  assert.equal(st.assets[0].issued, 5);
  assert.equal(st.movements.length, 2);
  assert.equal(
    (await a.req("assets/save", { ...st.assets[0], quantity: 4 })).status,
    400,
  );
  a.DB.close();
});
test("permissions cannot be delegated beyond authority or remove own management", async () => {
  const a = await app();
  await a.req("state");
  assert.equal(
    (
      await a.req("users/save", {
        id: "owner",
        version: 1,
        name: "Owner",
        status: "active",
        grants: [],
        bundles: [],
      })
    ).status,
    400,
  );
  const m = await addMember(a, "manager", [
    { resource: "users", action: "manage", effect: "allow", scope: "all" },
  ]);
  assert.equal(
    (
      await a.req(
        "users/save",
        { name: "Escalation", status: "active", grants: full },
        m,
      )
    ).status,
    403,
  );
  a.DB.close();
});
test("legacy copy is explicit, one-time and does not rewrite original records", async () => {
  const a = await app();
  await a.req("state");
  await a.DB.exec(fs.readFileSync("migrations/0001_initial.sql", "utf8"));
  await a.DB.prepare("INSERT INTO seasons VALUES(?,?,?,?,?,?,?,?)")
    .bind(
      "old",
      "قديم",
      2026,
      50000,
      "2026-01-01",
      "2026-12-31",
      "active",
      "2026-01-01T00:00:00Z",
    )
    .run();
  await a.DB.prepare("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(
      "old-task",
      "old",
      "مهمة قديمة",
      "التشغيل",
      "عضو سابق",
      "2026-10-01",
      "done",
      "high",
      "2026-01-01T00:00:00Z",
    )
    .run();
  assert.equal((await a.req("legacy")).data.imported, false);
  assert.equal((await a.req("legacy/import", {})).status, 200);
  assert.equal((await a.req("legacy")).data.imported, true);
  assert.equal((await a.req("legacy/import", {})).status, 400);
  assert.equal(
    (await a.DB.prepare("SELECT COUNT(*) AS n FROM tasks").first()).n,
    1,
  );
  assert.equal((await a.req("state")).data.tasks.length, 1);
  a.DB.close();
});
