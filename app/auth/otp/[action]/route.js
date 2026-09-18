import { serverEnvironment } from "../../../../lib/server-runtime.js";
import { loginEndpoint, privateHeaders } from "../../../../lib/login.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req, context) {
  try {
    return await loginEndpoint(
      req,
      await serverEnvironment(),
      (await context.params).action,
    );
  } catch {
    return Response.json(
      { error: "تعذر الاتصال بخدمة الدخول. حاول لاحقًا." },
      { status: 503, headers: privateHeaders },
    );
  }
}
