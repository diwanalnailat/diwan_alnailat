import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error(
    "Local D1 development requires Node 22.22.2+. Run: npx --yes --package=node@22 node scripts/dev-next.mjs",
  );
  process.exit(1);
}

const processes = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill();
  process.exitCode = code;
}
function start(args, env = {}) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  processes.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}

start(["scripts/dev.mjs"], {
  DIWAN_LOCAL_PORT: "4174",
  DIWAN_LOCAL_ORIGIN: "http://127.0.0.1:4173",
});
start([
  require.resolve("next/dist/bin/next"),
  "dev",
  "--hostname",
  "127.0.0.1",
  "--port",
  "4173",
]);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
