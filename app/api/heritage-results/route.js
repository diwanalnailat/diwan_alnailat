import { serverEnvironment } from "../../../lib/server-runtime.js";
import { heritageResults } from "../../../lib/heritage-results.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { DB } = await serverEnvironment();
    const { seasons } = await heritageResults(DB);
    return Response.json(
      { seasons },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "تعذر تحميل نتائج المواسم. حاول مرة أخرى." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
