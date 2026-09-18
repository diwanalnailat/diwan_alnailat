import { workspaceRequest } from "../../lib/workspace-server.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function GET(req) {
  return workspaceRequest(req, true);
}
