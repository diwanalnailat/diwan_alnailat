import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
const files = readdirSync("tests").filter((file) => file.endsWith(".test.mjs"));
const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...files.map((file) => `tests/${file}`)],
  {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, DIWAN_TEST_DATABASE: "postgres" },
  },
);
process.exitCode = result.status ?? 1;
