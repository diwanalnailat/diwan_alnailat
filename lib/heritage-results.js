import { DEFAULT_HERITAGE_SEASONS } from "./heritage-defaults.js";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (value, label, max, optional = false) => {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (!optional && !value.trim())
  )
    fail(`تحقق من ${label}`);
  return value.trim();
};
export function validateHeritageSeasons(value) {
  if (!Array.isArray(value) || value.length > 50) fail("الحد الأقصى 50 موسمًا");
  const editions = new Set();
  let total = 0;
  return value
    .map((s) => {
      if (!s || typeof s !== "object") fail("بيانات الموسم غير صالحة");
      const edition = String(s.edition ?? "");
      if (!/^[1-9][0-9]{0,3}$/.test(edition) || editions.has(edition))
        fail("رقم النسخة يجب أن يكون موجبًا وغير مكرر");
      editions.add(edition);
      if (
        !Array.isArray(s.awards) ||
        s.awards.length > 100 ||
        (total += s.awards.length) > 500
      )
        fail("الحد الأقصى 100 نتيجة للموسم و500 نتيجة إجمالًا");
      return {
        edition,
        season: text(s.season, "اسم الموسم", 40),
        title: text(s.title, "عنوان الموسم", 120),
        awards: s.awards.map((a) => {
          if (!a || !Number.isInteger(a.rank) || a.rank < 1 || a.rank > 999)
            fail("المركز يجب أن يكون رقمًا صحيحًا من 1 إلى 999");
          const date = text(a.date ?? "", "تاريخ النتيجة", 10, true);
          if (
            date &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
              !Number.isFinite(Date.parse(date)) ||
              new Date(date).toISOString().slice(0, 10) !== date)
          )
            fail("تاريخ النتيجة غير صالح");
          const camel = text(a.camel ?? "", "اسم المطية", 120, true);
          return {
            rank: a.rank,
            title: text(a.title, "اسم الشوط", 160),
            ...(date ? { date } : {}),
            ...(camel ? { camel } : {}),
          };
        }),
      };
    })
    .sort((a, b) => Number(b.edition) - Number(a.edition));
}
export async function heritageResults(db) {
  const row = await db
    .prepare(
      "SELECT value,version FROM nl_settings WHERE key='heritage_results'",
    )
    .first();
  // An explicitly saved empty list stays empty; defaults apply only to an absent record.
  return {
    seasons: validateHeritageSeasons(
      row ? JSON.parse(row.value) : DEFAULT_HERITAGE_SEASONS,
    ),
    version: row?.version ?? 0,
  };
}
export async function saveHeritageResults(db, c, body) {
  c.need("heritage_results", "manage");
  if (!Number.isSafeInteger(body.version) || body.version < 0)
    fail("إصدار البيانات غير صالح");
  const seasons = validateHeritageSeasons(body.seasons);
  const previous = await heritageResults(db);
  if (body.version !== previous.version)
    fail("تغيرت النتائج. أغلق النموذج وافتحه مجددًا لتحميل أحدث نسخة", 409);
  const value = JSON.stringify(seasons);
  if (value.length > 100000) fail("النتائج أكبر من الحد المسموح", 413);
  await db.batch([
    db
      .prepare(
        "INSERT INTO nl_settings(key,value,version) VALUES('heritage_results',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=nl_settings.version+1 WHERE nl_settings.version=?",
      )
      .bind(value, body.version),
    db
      .prepare("INSERT INTO nl_guards(id,value) VALUES(?,changes())")
      .bind(crypto.randomUUID()),
    db
      .prepare(
        "INSERT INTO nl_audit(id,actor,action,resource,entity_id,detail,created) VALUES(?,?,'تحديث نتائج المواسم','settings','heritage_results',?,?)",
      )
      .bind(
        crypto.randomUUID(),
        c.u.id,
        `${seasons.length} مواسم`,
        new Date().toISOString(),
      ),
  ]);
  return { ok: true, version: previous.version + 1 };
}
