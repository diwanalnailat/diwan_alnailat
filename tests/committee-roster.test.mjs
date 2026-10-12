import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./support.mjs";

for (const mode of ["sqlite", "postgres"]) {
  test(`${mode}: committee roster scopes people, role messages and real login evidence`, async () => {
    process.env.DIWAN_TEST_DATABASE = mode;
    const a = await fixture();
    try {
      const timestamp = "2026-10-12T22:00:00.000Z";
      const notice = async (id, member, title, status, entity = a.cid) => {
        await a.DB.prepare(
          "INSERT INTO nl_notifications VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
          .bind(
            id,
            member,
            title,
            "PRIVATE BODY",
            "committees",
            entity,
            a.pid,
            "whatsapp",
            status,
            timestamp,
          )
          .run();
      };
      await notice(
        "manager-role",
        a.manager.memberId,
        "Manager assignment",
        "accepted",
      );
      await notice(
        "member-role",
        a.manager.memberId,
        "Membership assignment",
        "queued",
      );
      await notice(
        "worker-role",
        a.member.memberId,
        "Membership assignment",
        "sent",
      );
      await notice(
        "outsider-role",
        a.outsider.memberId,
        "PRIVATE OUTSIDER",
        "read",
      );
      await notice(
        "other-committee",
        a.manager.memberId,
        "PRIVATE OTHER COMMITTEE",
        "read",
        "other",
      );
      await a.DB.prepare(
        "INSERT INTO nl_delivery_jobs(id,status,updated) VALUES(?,?,?)",
      )
        .bind("manager-role", "delivered", timestamp)
        .run();
      await a.DB.prepare(
        "INSERT INTO nl_audit(id,actor,action,resource,entity_id,detail,created) VALUES(?,?,'login','users',?,?,?)",
      )
        .bind(
          "real-login",
          a.manager.memberId,
          a.manager.memberId,
          "PRIVATE LOGIN",
          timestamp,
        )
        .run();
      await a.DB.prepare("UPDATE nl_members SET verified=1 WHERE id=?")
        .bind(a.member.memberId)
        .run();
      if (mode === "postgres") {
        // PGlite bypasses postgres.js parameter serialization. Reproduce its
        // jsonb string encoding, confirmed against the production driver.
        const prepare = a.DB.prepare;
        a.DB.prepare = (sql) => {
          const statement = prepare(sql);
          if (!sql.includes("json_each(?)")) return statement;
          return {
            ...statement,
            bind: (...values) =>
              statement.bind(
                ...values.map((value) =>
                  typeof value === "string" && value.startsWith("[")
                    ? JSON.stringify(value)
                    : value,
                ),
              ),
          };
        };
      }
      const result = await a.req(`committees/roster?id=${a.cid}`);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal(result.data.can_track, true);
      assert.equal(
        result.data.people.filter((p) => p.id === a.manager.memberId).length,
        1,
      );
      const manager = result.data.people.find(
        (p) => p.id === a.manager.memberId,
      );
      assert.deepEqual(manager.messages.map((m) => m.status).sort(), [
        "delivered",
        "queued",
      ]);
      assert.equal(manager.last_login, timestamp);
      const member = result.data.people.find((p) => p.id === a.member.memberId);
      assert.equal(member.messages[0].status, "sent");
      assert.equal(
        member.last_login,
        null,
        "verified is not evidence of login",
      );
      assert.ok(!JSON.stringify(result.data).includes("PRIVATE"));
      assert.ok(!result.data.people.some((p) => p.id === a.outsider.memberId));
      for (const person of result.data.people) {
        assert.equal(person.phone, undefined);
        assert.equal(person.email, undefined);
      }
      const limited = await a.req(
        `committees/roster?id=${a.cid}`,
        undefined,
        a.member,
      );
      assert.equal(limited.status, 200);
      assert.equal(limited.data.can_track, false);
      assert.ok(
        limited.data.people.every(
          (p) => !("messages" in p) && !("last_login" in p),
        ),
      );
      await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
        .bind(
          JSON.stringify([
            {
              resource: "committees",
              action: "edit",
              scope: "committee",
              committeeId: a.cid,
              effect: "allow",
            },
          ]),
          a.manager.memberId,
        )
        .run();
      assert.equal(
        (await a.req(`committees/roster?id=${a.cid}`, undefined, a.manager))
          .data.can_track,
        true,
      );
      assert.equal(
        (await a.req(`committees/roster?id=${a.cid}`, undefined, a.outsider))
          .status,
        403,
      );
      assert.equal(
        (await a.req(`committees/roster?id=${a.cid}`, undefined, null)).status,
        401,
      );
      assert.equal((await a.req("committees/roster?id=missing")).status, 404);
      const deny = [
        {
          resource: "committees",
          action: "edit",
          scope: "all",
          effect: "deny",
        },
      ];
      await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
        .bind(JSON.stringify(deny), a.manager.memberId)
        .run();
      assert.equal(
        (await a.req(`committees/roster?id=${a.cid}`, undefined, a.manager))
          .data.can_track,
        false,
      );
      deny[0].action = "view";
      await a.DB.prepare("UPDATE nl_members SET grants=? WHERE id=?")
        .bind(JSON.stringify(deny), a.manager.memberId)
        .run();
      assert.equal(
        (await a.req(`committees/roster?id=${a.cid}`, undefined, a.manager))
          .status,
        403,
      );
      await a.DB.prepare(
        "UPDATE nl_committees SET manager_id=NULL,members='[]',config='{}' WHERE id=?",
      )
        .bind(a.cid)
        .run();
      const empty = await a.req(`committees/roster?id=${a.cid}`);
      assert.equal(empty.status, 200);
      assert.deepEqual(empty.data.people, []);
    } finally {
      if (mode === "sqlite") a.DB.close();
    }
  });
}
