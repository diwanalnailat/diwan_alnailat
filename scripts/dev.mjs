// Explicit localhost-only development entrypoint. Never used by the hosted Worker.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import worker from "../worker.js";
import { database } from "./sqlite.mjs";
const root = process.env.DIWAN_LOCAL_DATA || "/tmp/diwan-local";
fs.mkdirSync(root, { recursive: true });
const DB = database(path.join(root, "workspace.sqlite"));
await DB.exec(
  "CREATE TABLE IF NOT EXISTS local_migration_journal(name TEXT PRIMARY KEY)",
);
for (const name of fs
  .readdirSync("drizzle")
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  if (
    await DB.prepare("SELECT name FROM local_migration_journal WHERE name=?")
      .bind(name)
      .first()
  )
    continue;
  await DB.exec(fs.readFileSync("drizzle/" + name, "utf8"));
  await DB.prepare("INSERT INTO local_migration_journal VALUES(?)")
    .bind(name)
    .run();
}
const objectPath = (key) => {
  if (!/^files\/[a-zA-Z0-9-]+$/.test(key))
    throw Error("Invalid local object key");
  return path.join(root, key);
};
const BUCKET = {
  put: async (key, bytes) => {
    const p = objectPath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, new Uint8Array(bytes));
  },
  get: async (key) => {
    const p = objectPath(key);
    return fs.existsSync(p) ? { body: fs.readFileSync(p) } : null;
  },
  delete: async (key) => fs.rmSync(objectPath(key), { force: true }),
};
const port = Number(process.env.DIWAN_LOCAL_PORT || 4173);
const origin = process.env.DIWAN_LOCAL_ORIGIN || `http://127.0.0.1:${port}`;
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
) {
  throw new Error(
    "Local development requires a loopback origin and valid port",
  );
}
const env = { DB, BUCKET, SITE_OWNER_EMAIL: "developer@localhost.test" };
http
  .createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = {
        ...req.headers,
        "oai-authenticated-user-id": "local-developer",
        "oai-authenticated-user-email": env.SITE_OWNER_EMAIL,
      };
      const request = new Request(origin + req.url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      });
      const r = await worker.fetch(request, env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Local development request failed");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Local development Worker: http://127.0.0.1:${port}`),
  );
