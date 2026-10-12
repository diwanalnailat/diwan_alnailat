import { parse } from "./domain.js";
import { committeeConfig } from "./governance.js";

// Never expose contact details, credentials, provider errors or session identifiers.
export async function committeeRoster(db, c, id) {
  const committee = c.committees.find((item) => item.id === id);
  if (!committee)
    throw Object.assign(new Error("اللجنة غير موجودة"), { status: 404 });
  c.need("committees", "view", committee);
  const tracking = c.can("committees", "edit", committee);
  const roles = new Map();
  const add = (memberId, label) => {
    if (!memberId) return;
    if (!roles.has(memberId)) roles.set(memberId, new Set());
    roles.get(memberId).add(label);
  };
  add(committee.manager_id, "مدير اللجنة");
  for (const member of parse(committee.members, []))
    add(
      member.id,
      member.title ||
        {
          manager: "مدير اللجنة",
          supervisor: "مشرف اللجنة",
          member: "عضو اللجنة",
        }[member.role] ||
        "عضو اللجنة",
    );
  const config = committeeConfig(committee);
  add(config.second_approver_id, "المعتمد الثاني للمصاريف");
  add(config.review_delegate_id, "بديل الاعتماد");
  const ids = JSON.stringify([...roles.keys()]);
  const { results: people } = await db
    .prepare(
      "SELECT id,name,status FROM nl_members WHERE id IN (SELECT value FROM json_each(?))",
    )
    .bind(ids)
    .all();
  let notices = [],
    logins = [];
  if (tracking) {
    ({ results: notices } = await db
      .prepare(
        "SELECT n.member_id,n.title,n.created,COALESCE(j.status,n.status) AS status FROM nl_notifications n LEFT JOIN nl_delivery_jobs j ON j.id=n.id WHERE n.resource='committees' AND n.entity_id=? AND n.channel='whatsapp' AND n.member_id IN (SELECT value FROM json_each(?)) ORDER BY n.created DESC,n.id DESC",
      )
      .bind(id, ids)
      .all());
    ({ results: logins } = await db
      .prepare(
        "SELECT actor,MAX(created) AS last_login FROM nl_audit WHERE action='login' AND resource='users' AND actor IN (SELECT value FROM json_each(?)) GROUP BY actor",
      )
      .bind(ids)
      .all());
  }
  return {
    committee_id: id,
    can_track: tracking,
    people: [...roles].map(([memberId, labels]) => {
      const member = people.find((item) => item.id === memberId);
      const row = {
        id: memberId,
        name: member?.name || "عضو غير متاح",
        status: member?.status || "unavailable",
        roles: [...labels],
      };
      if (tracking) {
        // A delivered role must not hide another pending role for the same person.
        const latest = new Map();
        for (const notice of notices.filter(
          (item) => item.member_id === memberId,
        ))
          if (!latest.has(notice.title))
            latest.set(notice.title, {
              title: notice.title,
              status: notice.status,
              created: notice.created,
            });
        row.messages = [...latest.values()];
        row.last_login =
          logins.find((item) => item.actor === memberId)?.last_login || null;
      }
      return row;
    }),
  };
}
