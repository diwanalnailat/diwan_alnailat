import { workspaceRequest } from "../../../lib/workspace-server.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Do not forward Next's context as the workspace HTML flag.
const handle = (req) => workspaceRequest(req);
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
