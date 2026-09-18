// Explicit localhost-only development entrypoint. Never used by the hosted Worker.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import worker from "../worker.js";
import { database } from "./sqlite.mjs";
import { postgresDatabase } from "../lib/postgres.js";
import { supabaseStorage } from "../lib/supabase-storage.js";
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const root = process.env.DIWAN_LOCAL_DATA || "/tmp/diwan-local";
fs.mkdirSync(root, { recursive: true });
const remote = Boolean(process.env.DATABASE_URL);
const DB = remote
  ? await postgresDatabase(process.env.DATABASE_URL)
  : database(path.join(root, "workspace.sqlite"));
if (!remote) {
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
} else {
  // Fail closed if configuration/schema is incomplete; never silently save locally.
  await DB.prepare("SELECT key FROM nl_settings LIMIT 1").first();
}
const objectPath = (key) => {
  if (!/^files\/[a-zA-Z0-9-]+$/.test(key))
    throw Error("Invalid local object key");
  return path.join(root, key);
};
const BUCKET = remote
  ? supabaseStorage(process.env)
  : {
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
if (remote && !(await BUCKET.inspect()))
  throw new Error(
    "Private Storage bucket missing. Run npm run db:setup-storage.",
  );
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
const env = {
  ...process.env,
  DB,
  BUCKET,
  SITE_OWNER_EMAIL: "developer@localhost.test",
};
http
  .createServer(async (req, res) => {
    try {
      if (
        ![
          new URL(origin).host,
          `127.0.0.1:${port}`,
          `localhost:${port}`,
        ].includes(req.headers.host) ||
        req.headers["sec-fetch-site"] === "cross-site"
      ) {
        res.writeHead(403);
        return res.end("Local access only");
      }
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 12 * 1024 * 1024) {
          res.writeHead(413);
          return res.end("Request too large");
        }
        chunks.push(c);
      }
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
      const r = await worker.fetch(request, env, {
        waitUntil: (job) => {
          Promise.resolve(job).catch(() => {});
        },
      });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Local development request failed");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(
      `Local development Worker: http://127.0.0.1:${port} (${remote ? "Supabase PostgreSQL + private Storage" : "local SQLite"})`,
    ),
  );
