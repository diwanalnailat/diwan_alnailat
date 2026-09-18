// Production remains closed until independent WhatsApp OTP sessions are enabled.
// Development rewrites these requests to the loopback-only Worker.
const closed = () =>
  Response.json(
    { error: "لوحة التحكم مغلقة مؤقتًا حتى تفعيل تسجيل الدخول." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
export {
  closed as GET,
  closed as POST,
  closed as PUT,
  closed as PATCH,
  closed as DELETE,
  closed as HEAD,
  closed as OPTIONS,
};
