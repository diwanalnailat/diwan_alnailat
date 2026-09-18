import "server-only";
import { after } from "next/server";
import { serverEnvironment } from "./server-runtime.js";
import { sessionMember, privateHeaders } from "./login.js";

export async function workspaceRequest(req, html = false) {
  try {
    const env = await serverEnvironment();
    const member = await sessionMember(req, env);
    if (!member)
      return html
        ? new Response(null, {
            status: 303,
            headers: { ...privateHeaders, Location: "/login" },
          })
        : Response.json(
            { error: "انتهت الجلسة. سجّل الدخول للمتابعة." },
            { status: 401, headers: privateHeaders },
          );
    const headers = new Headers(req.headers);
    for (const name of [...headers.keys()])
      if (name.startsWith("oai-")) headers.delete(name);
    headers.set(
      "oai-authenticated-user-id",
      member.site_id || "member:" + member.id,
    );
    headers.set(
      "oai-authenticated-user-email",
      member.email || member.id + "@members.invalid",
    );
    const url = new URL(req.url);
    if (html) url.pathname = "/";
    const trusted = new Request(url, {
      method: req.method,
      headers,
      ...(!["GET", "HEAD"].includes(req.method)
        ? { body: req.body, duplex: "half" }
        : {}),
    });
    const { default: worker } = await import("../worker.js");
    const response = await worker.fetch(
      trusted,
      {
        ...env,
        AUTHENTICATED_MEMBER_ID: member.id,
        SITE_OWNER_EMAIL: undefined,
      },
      { waitUntil: (job) => after(() => job) },
    );
    if (!html) return response;
    const content = await response.text();
    const resultHeaders = new Headers(response.headers);
    resultHeaders.set("Cache-Control", "no-store");
    return new Response(
      content.replace(
        "</body>",
        '<script src="/session.js" defer></script></body>',
      ),
      { status: response.status, headers: resultHeaders },
    );
  } catch {
    return Response.json(
      { error: "تعذر الاتصال بالديوان. حاول لاحقًا." },
      { status: 503, headers: privateHeaders },
    );
  }
}
