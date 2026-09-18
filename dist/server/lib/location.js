// Optional record locations. Never inferred from a member's device in the background.
export function validateLocation(value) {
  if (value == null) return null;
  const bad = () => {
    throw Object.assign(
      new Error(
        "راجع اسم الموقع والإحداثيات؛ خط العرض من -90 إلى 90 وخط الطول من -180 إلى 180",
      ),
      { status: 400 },
    );
  };
  if (typeof value !== "object" || Array.isArray(value)) bad();
  const text = (v, max) => {
    if (v != null && typeof v !== "string") bad();
    if ((v || "").length > max) bad();
    return (v || "").trim();
  };
  const label = text(value.label, 200),
    notes = text(value.notes, 1000);
  const empty = (v) => v === "" || v == null;
  if (empty(value.lat) !== empty(value.lng)) bad();
  let lat = null,
    lng = null;
  if (!empty(value.lat)) {
    if (
      ![value.lat, value.lng].every(
        (v) =>
          ["number", "string"].includes(typeof v) && String(v).trim() !== "",
      )
    )
      bad();
    lat = Number(value.lat);
    lng = Number(value.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      bad();
  }
  return label || notes || lat !== null ? { label, notes, lat, lng } : null;
}
