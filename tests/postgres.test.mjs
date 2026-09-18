import test from "node:test";
import assert from "node:assert/strict";
import { postgresStatement } from "../lib/postgres.js";
import { postgresTestDatabase } from "./postgres-support.mjs";

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
  } finally {
    await db.close();
  }
});
