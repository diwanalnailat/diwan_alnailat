import { googleMapsUrl, googleMapsPoint } from "./google-maps.js";
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
    notes = text(value.notes, 1000),
    mapUrl = text(value.map_url, 4096);
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
  if (mapUrl) {
    googleMapsUrl(mapUrl);
    if (lat === null) bad();
    const linked = googleMapsPoint(mapUrl);
    if (
      linked &&
      (Math.abs(linked.lat - lat) > 0.000002 ||
        Math.abs(linked.lng - lng) > 0.000002)
    )
      throw Object.assign(
        new Error(
          "الرابط لا يطابق النقطة المحددة. أعد تحديد الموقع من الرابط.",
        ),
        { status: 400 },
      );
  }
  return label || notes || lat !== null
    ? {
        label,
        notes,
        lat,
        lng,
        ...(mapUrl ? { map_url: googleMapsUrl(mapUrl).href } : {}),
      }
    : null;
}
