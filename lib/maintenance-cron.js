import { createHash, timingSafeEqual } from "node:crypto";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

// Authenticate before opening a database connection or loading business jobs.
export async function maintenanceCron(request, secret, run) {
  if (request.method !== "GET")
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers },
    );
  const configured = typeof secret === "string" && secret.length >= 32;
  const supplied = request.headers.get("authorization") || "";
  const digest = (value) => createHash("sha256").update(value).digest();
  if (
    !configured ||
    !timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    return Response.json({ ok: true, ...(await run()) }, { headers });
  } catch {
    // Do not expose database, provider or credential details in a public route.
    return Response.json(
      { error: "Maintenance failed" },
      { status: 503, headers },
    );
  }
}
