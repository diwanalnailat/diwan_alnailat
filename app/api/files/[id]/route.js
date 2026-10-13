import { workspaceRequest } from "../../../../lib/workspace-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Large private downloads stream through the same authorization boundary.
export const maxDuration = 300;
export const GET = (req) => workspaceRequest(req);
