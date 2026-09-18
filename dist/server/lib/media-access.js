import { parse } from "./domain.js";
export function canReadEngagement(c, e) {
  const p = c.projectRows.find((p) => p.id === e.project_id);
  return !!p && c.can("projects", "view", p);
}
export function mediaForReader(c, profile) {
  if (!profile) return profile;
  return {
    ...profile,
    engagements: (profile.engagements || []).filter((e) =>
      canReadEngagement(c, e),
    ),
  };
}
export function canReadSupplierFile(c, supplier, fileId) {
  if (
    !c.can("suppliers", "view", supplier) ||
    !c.can("suppliers", "edit", supplier)
  )
    return false;
  const engagements = (
    parse(supplier.meta).media_profile?.engagements || []
  ).filter((e) => (e.file_ids || []).includes(fileId));
  // Files belonging to another season must not escape through the supplier file list.
  return engagements.every((e) => canReadEngagement(c, e));
}
