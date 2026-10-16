import test from "node:test";
import assert from "node:assert/strict";
import { postgresStatement } from "../lib/postgres.js";
import { postgresTestDatabase } from "./postgres-support.mjs";
import { limits } from "../lib/integrations.js";

test("serialized JSON lists bind as text before PostgreSQL expands them", async () => {
  const db = await postgresTestDatabase();
  try {
    const source = "SELECT value FROM json_each(?)";
    // Postgres.js chooses its serializer from the server's parameter type.
    // JSONB here would JSON.stringify an already encoded string a second time.
    await db
      .prepare("PREPARE diwan_json_list AS " + postgresStatement(source))
      .run();
    assert.equal(
      (
        await db
          .prepare(
            "SELECT parameter_types[1]::text AS type FROM pg_prepared_statements WHERE name='diwan_json_list'",
          )
          .first()
      ).type,
      "text",
    );
    const values = [
      "synthetic-asset",
      "اسم بالعربية",
      'a"b',
      "'); DROP TABLE nl_assets; --",
    ];
    assert.deepEqual(
      (await db.prepare(source).bind(JSON.stringify(values)).all()).results.map(
        (row) => row.value,
      ),
      values,
    );
    assert.deepEqual((await db.prepare(source).bind("[]").all()).results, []);
    const multiple = await db
      .prepare(
        "SELECT a.value AS first, b.value AS second FROM json_each(?) a CROSS JOIN json_each(?) b",
      )
      .bind('["first"]', '["second"]')
      .first();
    assert.deepEqual(multiple, { first: "first", second: "second" });
    await assert.rejects(db.prepare(source).bind('"scalar"').all(), /scalar/);
    await db.prepare("DEALLOCATE diwan_json_list").run();
  } finally {
    await db.close();
  }
});

test("PostgreSQL keeps parameter values separate and rolls back entire guarded batches", async () => {
  assert.equal(
    postgresStatement("SELECT '?' AS literal, ? AS value, 'it''s ?' AS quoted"),
    "SELECT '?' AS literal, $1 AS value, 'it''s ?' AS quoted",
  );
  const db = await postgresTestDatabase();
  try {
    const value = "Arabic note: '); DROP TABLE nl_settings; -- ?";
    await db.batch([
      db.prepare("INSERT INTO nl_settings VALUES(?,?,1)").bind("test", value),
    ]);
    assert.equal(
      (
        await db
          .prepare("SELECT value FROM nl_settings WHERE key=?")
          .bind("test")
          .first()
      ).value,
      value,
    );
    await assert.rejects(
      db.batch([
        db
          .prepare("INSERT INTO nl_settings VALUES(?,?,1)")
          .bind("must-rollback", "value"),
        db
          .prepare("UPDATE nl_settings SET value=? WHERE key=?")
          .bind("no", "missing"),
        db.prepare("INSERT INTO nl_guards VALUES(?,changes())").bind("guard"),
      ]),
      /nl_guard_changed/,
    );
    assert.equal(
      await db
        .prepare("SELECT key FROM nl_settings WHERE key=?")
        .bind("must-rollback")
        .first(),
      null,
    );
    await assert.rejects(
      db
        .prepare("INSERT INTO nl_guards VALUES(?,changes())")
        .bind("outside")
        .run(),
      /atomic batch/,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT value FROM nl_settings WHERE key=?")
          .bind("test")
          .first()
      ).value,
      value,
    );
    // Fused writes preserve parameter binding, affected counts and rollback.
    const guarded = await db.batch([
      db
        .prepare("INSERT INTO nl_settings VALUES(?,?,1)")
        .bind("guarded", value),
      db
        .prepare("INSERT INTO nl_guards(id,value) VALUES(?,changes())")
        .bind("insert-guard"),
    ]);
    assert.deepEqual(
      guarded.map((r) => r.meta.changes),
      [1, 1],
    );
    await assert.rejects(
      db.batch([
        db
          .prepare("UPDATE nl_settings SET value=? WHERE key IN (?,?)")
          .bind("incorrect", "test", "guarded"),
        db
          .prepare("INSERT INTO nl_guards VALUES(?,changes())")
          .bind("multirow-guard"),
      ]),
      /nl_guard_changed/,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT value FROM nl_settings WHERE key='guarded'")
          .first()
      ).value,
      value,
    );
    // Independent windows still reject at their own limits after batching.
    const windows = [
      ["test:global", 10, 3600],
      ["test:cooldown", 1, 60],
    ];
    await limits(db, windows);
    await assert.rejects(limits(db, windows), (error) => error.status === 429);
    await db
      .prepare(
        "UPDATE nl_integration_limits SET expires=0 WHERE key='test:cooldown'",
      )
      .run();
    await limits(db, windows);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT hits FROM nl_integration_limits WHERE key='test:global'",
          )
          .first()
      ).hits,
      3,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT hits FROM nl_integration_limits WHERE key='test:cooldown'",
          )
          .first()
      ).hits,
      1,
    );
  } finally {
    await db.close();
  }
});
