const invalid = (
  message = "أدخل رابط موقع من خرائط Google بصيغة https.",
  status = 400,
) => {
  throw Object.assign(new Error(message), { status });
};
const googleHosts = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.com.sa",
  "www.google.com.sa",
  "maps.google.com.sa",
  "google.co.uk",
  "www.google.co.uk",
  "google.ae",
  "www.google.ae",
]);

export function googleMapsUrl(value) {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\x00-\x20\\]/.test(value.trim())
  )
    invalid();
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    invalid();
  }
  const maps =
    googleHosts.has(url.hostname) &&
    (url.hostname.startsWith("maps.") || /^\/maps(?:\/|$)/.test(url.pathname));
  const short =
    (url.hostname === "maps.app.goo.gl" &&
      /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) ||
    (url.hostname === "goo.gl" &&
      /^\/maps\/[a-zA-Z0-9]+\/?$/.test(url.pathname));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (!maps && !short)
  )
    invalid();
  return url;
}
const number = "(-?\\d+(?:\\.\\d+)?)";
function point(match) {
  if (!match) return null;
  const lat = Number(match[1]),
    lng = Number(match[2]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    invalid("إحداثيات رابط الموقع غير صالحة.");
  return { lat, lng };
}
export function googleMapsPoint(value) {
  const url = googleMapsUrl(value);
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname + url.search);
  } catch {
    invalid();
  }
  // A place's pin wins over the @ camera center, which may be miles away.
  const pin = point(decoded.match(new RegExp("!3d" + number + "!4d" + number)));
  if (pin) return pin;
  for (const key of ["destination", "daddr", "query", "q", "ll"]) {
    const match = (url.searchParams.get(key) || "").match(
      new RegExp(
        "^\\s*(?:loc:)?" +
          number +
          "\\s*,\\s*" +
          number +
          "(?:\\s*\\([^)]*\\))?\\s*$",
      ),
    );
    if (match) return point(match);
  }
  const place = point(
    decoded
      .replaceAll("+", " ")
      .match(
        new RegExp(
          "/(?:place|search)/\\s*" +
            number +
            "\\s*,\\s*" +
            number +
            "(?:/|$|\\?)",
        ),
      ),
  );
  if (place) return place;
  // Do not silently substitute a named place/search/directions viewport for its pin.
  if (!/\/maps\/(?:place|search|dir)(?:\/|\?)/.test(decoded)) {
    const center = point(
      decoded.match(new RegExp("/@" + number + "," + number + "(?:,|/|$)")),
    );
    if (center) return center;
    return point(
      (url.searchParams.get("center") || "").match(
        new RegExp("^" + number + "," + number + "$"),
      ),
    );
  }
  return null;
}
export async function resolveGoogleMaps(value, request = fetch) {
  const original = googleMapsUrl(value).href;
  let url = original;
  const seen = new Set(),
    signal = AbortSignal.timeout(8000);
  for (let hops = 0; hops < 6; hops++) {
    googleMapsUrl(url); // Validate every hop before any outbound request (SSRF boundary).
    const coordinates = googleMapsPoint(url);
    if (coordinates) return { ...coordinates, map_url: original };
    if (seen.has(url))
      invalid(
        "تعذر فتح رابط الموقع المختصر. انسخ رابط المشاركة من خرائط Google.",
      );
    seen.add(url);
    let response;
    try {
      response = await request(url, {
        redirect: "manual",
        signal,
        headers: { Accept: "text/html" },
      });
    } catch {
      invalid(
        "تعذر الوصول إلى خرائط Google. أعد المحاولة أو حدد النقطة على الخريطة.",
        502,
      );
    }
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location)
      break;
    url = googleMapsUrl(new URL(location, url).href).href;
  }
  invalid(
    "الرابط لا يحدد نقطة واضحة. من خرائط Google اختر المكان ثم مشاركة ونسخ الرابط، أو حدد النقطة يدويًا.",
    422,
  );
}
