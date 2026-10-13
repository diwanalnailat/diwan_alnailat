import { string } from "./domain.js";
import { canDocument } from "./document-access.js";

// Cap candidate processing per resource. The caller can display the partial
// result notice and ask for a narrower term rather than scan every match.
const MAX_CANDIDATES = 500;

export async function workspaceSearch(db, c, value) {
  const normalize = (s) =>
    String(s || "")
      .normalize("NFKC")
      .replace(/[\u064B-\u065F\u0640]/g, "")
      .replace(/[أإآ]/g, "ا")
      .toLocaleLowerCase("ar");
  const q = normalize(string(value, 100).trim());
  if (q.length < 2) return { results: [] };
  const pattern = "%" + q.replace(/[!%_]/g, (x) => "!" + x) + "%";
  const definitions = [
    ["tasks", "nl_tasks", "title", "task"],
    ["expenses", "nl_expenses", "title", "expense"],
    ["assets", "nl_assets", "name", "asset"],
    ["suppliers", "nl_suppliers", "name", "supplier-view"],
    ["advances", "nl_advances", "title", "advance"],
    ["documents", "nl_guides", "title", "guide-view"],
  ];
  const groups = await Promise.all(
    definitions.map(async ([resource, table, field, action]) => {
      const columns =
        resource === "tasks"
          ? [field, "description"]
          : resource === "assets"
            ? [field, "serial", "category"]
            : resource === "suppliers"
              ? [field, "category"]
              : [field];
      const normalized = (column) => {
        let sql = `COALESCE(${column},'')`;
        for (const letter of "أإآ") sql = `replace(${sql},'${letter}','ا')`;
        for (const letter of "ـ" +
          Array.from({ length: 21 }, (_, i) =>
            String.fromCharCode(0x64b + i),
          ).join(""))
          sql = `replace(${sql},'${letter}','')`;
        return `lower(${sql})`;
      };
      const where = columns
        .map((column) => `${normalized(column)} LIKE ? ESCAPE '!'`)
        .join(" OR ");
      const visible = [];
      let cursor = "", scanned = 0, truncated = false;
      // Do not let inaccessible matches consume the visible result limit.
      // Seek through bounded matching batches; SQL search indexing is separate.
      while (visible.length < 25 && scanned < MAX_CANDIDATES) {
        const rows = (
          await db
            .prepare(
              `SELECT * FROM ${table} WHERE (${where}) AND id>? ORDER BY id LIMIT 50`,
            )
            .bind(...columns.map(() => pattern), cursor)
            .all()
        ).results;
        scanned += rows.length;
        if (resource === "documents") {
          const ids = [...new Set(rows.map((row) => row.task_id).filter(Boolean))];
          const tasks = ids.length
            ? (await db.prepare(`SELECT * FROM nl_tasks WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results
            : [];
          const byId = new Map(tasks.map((task) => [task.id, task]));
          visible.push(...rows.filter((row) => canDocument(c, "view", row, byId.get(row.task_id))));
        } else {
          visible.push(...rows.filter((row) => c.can(resource, "view", row)));
        }
        truncated = rows.length === 50 && scanned >= MAX_CANDIDATES && visible.length < 25;
        if (rows.length < 50) break;
        cursor = rows.at(-1).id;
      }
      return { truncated, results: visible
        .slice(0, 25)
        .map((row) => ({ id: row.id, resource, action, title: row[field] })) };
    }),
  );
  const matches = (rows, resource, field, action) =>
    rows
      .filter(
        (row) =>
          c.can(resource, "view", row) && normalize(row[field]).includes(q),
      )
      .slice(0, 25)
      .map((row) => ({ id: row.id, resource, action, title: row[field] }));
  return {
    results: [
      ...matches(c.projectRows, "projects", "title", "project-open"),
      ...matches(c.committees, "committees", "name", "committee-open"),
      ...groups.flatMap((group) => group.results),
    ].slice(0, 40),
    truncated: groups.some((group) => group.truncated),
  };
}
