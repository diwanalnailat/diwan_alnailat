import { after } from "next/server";
import { serverEnvironment } from "../../../../lib/server-runtime.js";
import { joinPublicEndpoint } from "../../../../lib/join-public.js";
import { privateHeaders } from "../../../../lib/login.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(req, context) {
  try {
    const { action } = await context.params;
    const env = await serverEnvironment();
    const response = await joinPublicEndpoint(req, env, action);
    if (req.method === "POST" && action === "verify" && response.ok) {
      after(async () => {
        const { dispatchNotifications } = await import("../../../../worker.js");
        await dispatchNotifications(env).catch(() => {});
      });
    }
    return response;
  } catch {
    return Response.json(
      { error: "تعذر الاتصال بالديوان. حاول لاحقًا." },
      { status: 503, headers: privateHeaders },
    );
  }
}
export const GET = handle;
export const POST = handle;
