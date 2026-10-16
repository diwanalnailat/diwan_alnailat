import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import { fixture, owner, saveTask, addProject } from "./support.mjs";

async function request(a, path, { body, as = owner, binary = false } = {}) {
  return worker.fetch(
    new Request("https://diwan.test/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: "https://diwan.test",
        ...(as
          ? {
              "oai-authenticated-user-id": as.id,
              "oai-authenticated-user-email": as.email,
            }
          : {}),
        ...(body === undefined
          ? {}
          : {
              "Content-Type": binary
                ? "application/octet-stream"
                : "application/json",
            }),
      },
      body:
        body === undefined ? undefined : binary ? body : JSON.stringify(body),
    }),
    a.env,
  );
}

test("task upload API accepts arbitrary formats privately and preserves exact download bytes", async () => {
  const a = await fixture(),
    task = await saveTask(a);
  const bytes = new TextEncoder().encode(
    "<script>not executable</script>\u0000archive",
  );
  const start = await request(a, "task-uploads/start", {
    body: {
      entity_id: task,
      name: "ملف.custom",
      size: bytes.length,
      purpose: "proof",
    },
  });
  assert.equal(start.status, 200, await start.clone().text());
  const { id } = await start.json();
  assert.equal((await request(a, `files/${id}`)).status, 403);
  const stagingState = await request(a, "state");
  assert.equal(stagingState.status, 200);
  assert.ok(
    !(await stagingState.text()).includes(id),
    "internal upload session is absent from workspace state",
  );
  assert.equal(
    (
      await request(a, `task-uploads/${id}/parts/0`, {
        body: bytes,
        binary: true,
        as: a.outsider,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(a, `task-uploads/${id}/parts/0`, {
        body: bytes,
        binary: true,
      })
    ).status,
    200,
  );
  const complete = await request(a, `task-uploads/${id}/complete`, {
    body: {},
  });
  assert.equal(complete.status, 200, await complete.clone().text());
  assert.equal(
    (await request(a, `task-uploads/${id}/complete`, { body: {} })).status,
    200,
  );
  const download = await request(a, `files/${id}?inline`);
  assert.equal(download.status, 200);
  assert.equal(
    download.headers.get("content-type"),
    "application/octet-stream",
  );
  assert.match(download.headers.get("content-disposition"), /^attachment;/);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
  assert.equal(
    (await request(a, `files/${id}`, { as: a.outsider })).status,
    403,
  );
  const internal = (
    await a.DB.prepare(
      "SELECT id FROM nl_files WHERE entity_type='task_parts'",
    ).all()
  ).results;
  for (const row of internal)
    assert.equal((await request(a, `files/${row.id}`)).status, 403);
  const finalState = await request(a, "state"),
    stateText = await finalState.text();
  assert.equal(finalState.status, 200);
  for (const row of internal)
    assert.ok(
      !stateText.includes(row.id),
      "private part row is absent from workspace state",
    );
  const detail = await a.req("tasks/" + task);
  assert.equal(detail.data.files.length, 1);
});

test("task upload authorization is refreshed after permission revocation and checks the 1 GiB boundary", async () => {
  const a = await fixture(),
    task = await saveTask(a);
  const over = await request(a, "task-uploads/start", {
    body: {
      entity_id: task,
      name: "large.zip",
      size: 1024 ** 3 + 1,
      purpose: "proof",
    },
  });
  assert.ok([400, 413].includes(over.status));
  const atLimit = await request(a, "task-uploads/start", {
    body: {
      entity_id: task,
      name: "large.zip",
      size: 1024 ** 3,
      purpose: "proof",
    },
  });
  assert.equal(atLimit.status, 200, await atLimit.clone().text());
  const first = await request(a, "task-uploads/start", {
    as: a.member,
    body: { entity_id: task, name: "proof.bin", size: 3, purpose: "proof" },
  });
  assert.equal(first.status, 200, await first.clone().text());
  const { id } = await first.json();
  await a.DB.prepare("UPDATE nl_members SET status='suspended' WHERE id=?")
    .bind(a.member.memberId)
    .run();
  const denied = await request(a, `task-uploads/${id}/parts/0`, {
    body: new Uint8Array([1, 2, 3]),
    binary: true,
    as: a.member,
  });
  assert.equal(denied.status, 403);
  assert.equal(
    (
      await request(a, `task-uploads/${id}/complete`, {
        body: {},
        as: a.member,
      })
    ).status,
    403,
  );
  assert.equal(a.objects.size, 0);
});

async function upload(
  a,
  scope,
  { as = owner, bytes = new Uint8Array([1, 2, 3]) } = {},
) {
  const start = await request(a, "task-uploads/start", {
    as,
    body: {
      name: "fixture.bin",
      size: bytes.length,
      purpose: "proof",
      ...scope,
    },
  });
  assert.equal(start.status, 200, await start.clone().text());
  const { id } = await start.json();
  const chunk = await request(a, `task-uploads/${id}/parts/0`, {
    body: bytes,
    binary: true,
    as,
  });
  assert.equal(chunk.status, 200, await chunk.clone().text());
  const complete = await request(a, `task-uploads/${id}/complete`, {
    body: {},
    as,
  });
  assert.equal(complete.status, 200, await complete.clone().text());
  return id;
}
const fileRow = (a, id) =>
  a.DB.prepare("SELECT * FROM nl_files WHERE id=?").bind(id).first();
const taskRow = (a, id) =>
  a.DB.prepare("SELECT * FROM nl_tasks WHERE id=?").bind(id).first();
async function bindOnStart(a, task, file) {
  const row = await taskRow(a, task);
  return a.req("tasks/transition", {
    id: task,
    version: row.version,
    status: "doing",
    files: [file],
  });
}

test("staged task attachments reject cross-task and cross-project binding and preserve valid binding", async () => {
  const a = await fixture(),
    first = await saveTask(a),
    other = await saveTask(a, { title: "Synthetic second task" });
  const bound = await upload(a, { entity_id: first, attach_later: true });
  const otherBefore = await taskRow(a, other);
  const rejected = await bindOnStart(a, other, bound);
  assert.equal(rejected.status, 403, JSON.stringify(rejected.data));
  assert.match(rejected.data.error, /المرفق/);
  assert.deepEqual(await taskRow(a, other), otherBefore);
  assert.equal((await fileRow(a, bound)).entity_type, "draft");

  const project = await addProject(a, "Synthetic other project");
  const committee = await a.req("committees/save", {
    project_id: project,
    name: "Synthetic other committee",
    description: "Synthetic fixture",
    manager_id: a.manager.memberId,
    second_approver_id: "owner",
    members: [],
  });
  assert.equal(committee.status, 200, JSON.stringify(committee.data));
  const crossProject = await upload(a, {
    project_id: project,
    committee_id: committee.data.id,
  });
  const projectRejected = await bindOnStart(a, other, crossProject);
  assert.equal(
    projectRejected.status,
    403,
    JSON.stringify(projectRejected.data),
  );
  assert.match(projectRejected.data.error, /المرفق/);
  assert.equal((await fileRow(a, crossProject)).entity_type, "draft");

  const accepted = await bindOnStart(a, first, bound);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal((await fileRow(a, bound)).entity_type, "tasks");
  assert.equal((await fileRow(a, bound)).entity_id, first);
});

test("actual upload API rechecks explicit upload denial and project closure after storage", async () => {
  for (const revoke of ["permission", "project"]) {
    const a = await fixture(),
      task = await saveTask(a);
    const start = await request(a, "task-uploads/start", {
      as: a.member,
      body: { entity_id: task, name: "fixture.zip", size: 3, purpose: "proof" },
    });
    assert.equal(start.status, 200, await start.clone().text());
    const { id } = await start.json();
    const put = a.env.BUCKET.put;
    a.env.BUCKET.put = async (...args) => {
      await put(...args);
      if (revoke === "permission")
        await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
          .bind(
            JSON.stringify([
              {
                resource: "tasks",
                action: "upload",
                effect: "deny",
                scope: "all",
              },
            ]),
            a.member.memberId,
          )
          .run();
      else
        await a.DB.prepare("UPDATE nl_projects SET status='closed' WHERE id=?")
          .bind(a.pid)
          .run();
    };
    const denied = await request(a, `task-uploads/${id}/parts/0`, {
      as: a.member,
      body: new Uint8Array([1, 2, 3]),
      binary: true,
    });
    assert.equal(denied.status, 403, await denied.clone().text());
    assert.equal(a.objects.size, 0, revoke + " removes uncommitted object");
    assert.equal(
      (
        await a.DB.prepare(
          "SELECT id FROM nl_files WHERE entity_type='task_parts'",
        ).all()
      ).results.length,
      0,
    );
    assert.equal(
      (
        await request(a, `task-uploads/${id}/complete`, {
          as: a.member,
          body: {},
        })
      ).status,
      403,
    );
    if (revoke === "project") {
      const closed = await request(a, "task-uploads/start", {
        body: {
          entity_id: task,
          name: "fixture.zip",
          size: 3,
          purpose: "proof",
        },
      });
      assert.equal(closed.status, 403);
    }
  }
});

test("task attachment binding rechecks upload permission and existing-task draft reads respect task denies", async () => {
  const a = await fixture(),
    task = await saveTask(a);
  const id = await upload(
    a,
    { entity_id: task, attach_later: true },
    { as: a.member },
  );
  await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
    .bind(
      JSON.stringify([
        { resource: "tasks", action: "upload", effect: "deny", scope: "all" },
      ]),
      a.member.memberId,
    )
    .run();
  const row = await taskRow(a, task);
  const rejected = await a.req(
    "tasks/transition",
    { id: task, version: row.version, status: "doing", files: [id] },
    a.member,
  );
  assert.equal(rejected.status, 403, JSON.stringify(rejected.data));
  assert.deepEqual(await taskRow(a, task), row);
  assert.equal((await fileRow(a, id)).entity_type, "draft");
  await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
    .bind(
      JSON.stringify([
        { resource: "tasks", action: "download", effect: "deny", scope: "all" },
      ]),
      a.member.memberId,
    )
    .run();
  assert.equal((await request(a, `files/${id}`, { as: a.member })).status, 403);
});

test("task voice attachments preserve playback MIME while default downloads remain attachments", async () => {
  const a = await fixture(),
    task = await saveTask(a),
    bytes = new Uint8Array([26, 69, 223, 163, 1, 2, 3]);
  const id = await upload(
    a,
    {
      entity_id: task,
      name: "voice.webm",
      mime: "audio/webm",
      purpose: "voice",
    },
    { bytes },
  );
  const inline = await request(a, `files/${id}?inline`);
  assert.equal(inline.status, 200);
  assert.equal(inline.headers.get("content-type"), "audio/webm");
  assert.match(inline.headers.get("content-disposition"), /^inline;/);
  assert.deepEqual(new Uint8Array(await inline.arrayBuffer()), bytes);
  const ordinary = await request(a, `files/${id}`);
  assert.match(ordinary.headers.get("content-disposition"), /^attachment;/);
  await ordinary.body.cancel();
});

test("task download stops before emitting stored bytes when its temporary permission expires", async () => {
  const a = await fixture(),
    task = await saveTask(a);
  const id = await upload(a, { entity_id: task });
  const grants = (expires) =>
    ["view", "download"].map((action) => ({
      resource: "tasks",
      action,
      effect: "allow",
      scope: "all",
      expires,
    }));
  await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
    .bind(
      JSON.stringify(grants(new Date(Date.now() + 3600000).toISOString())),
      a.outsider.memberId,
    )
    .run();
  const get = a.env.BUCKET.get;
  a.env.BUCKET.get = async (key) => {
    const object = await get(key);
    await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
      .bind(
        JSON.stringify(grants("2020-01-01T00:00:00.000Z")),
        a.outsider.memberId,
      )
      .run();
    return object;
  };
  const response = await request(a, `files/${id}`, { as: a.outsider });
  assert.equal(response.status, 200);
  await assert.rejects(response.arrayBuffer(), { status: 403 });
});
