import { parse, string, choice } from "./domain.js";

const prefix = "committee-member-title:";

// Titles describe membership; authorization continues to use role/grants.
export function normalizeMembershipTitle(member) {
  choice(member.role, ["member", "manager", "supervisor"]);
  if (member.title === undefined) return;
  member.title = string(member.title, 80).normalize("NFC").replace(/\s+/g, " ");
  if (member.role !== "member")
    throw Object.assign(new Error("الصفة المخصصة تُضاف ضمن عضوية اللجنة"), {
      status: 400,
    });
}

export async function membershipTitles(db) {
  const rows = await db
    .prepare(
      "SELECT value FROM nl_settings WHERE key LIKE 'committee-member-title:%'",
    )
    .all();
  return [
    ...new Set(
      rows.results
        .map((row) => parse(row.value).title)
        .filter((title) => typeof title === "string"),
    ),
  ].sort((a, b) => a.localeCompare(b, "ar"));
}

export async function membershipTitleStatements(db, members) {
  const statements = [];
  for (const title of new Set(members.map((m) => m.title).filter(Boolean))) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(title),
    );
    const key =
      prefix +
      [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    // Per-title keys avoid losing concurrent additions to a shared JSON list.
    statements.push(
      db
        .prepare(
          "INSERT INTO nl_settings(key,value,version) VALUES(?,?,1) ON CONFLICT(key) DO NOTHING",
        )
        .bind(key, JSON.stringify({ title })),
    );
  }
  return statements;
}
