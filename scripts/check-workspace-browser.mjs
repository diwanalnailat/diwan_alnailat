// Explicit isolated walkthrough: no dotenv, live database, or provider credentials.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import worker from "../worker.js";
import { fixture, owner, saveTask, saveExpense } from "../tests/support.mjs";
import { completionApprovalStatement } from "../lib/task-approvals.js";

const a = await fixture();
const taskId = await saveTask(a);
await saveExpense(a, { task_id: taskId });
await a.DB.prepare("UPDATE nl_tasks SET status='done' WHERE id=?")
  .bind(taskId)
  .run();
const task = await a.DB.prepare("SELECT * FROM nl_tasks WHERE id=?")
  .bind(taskId)
  .first();
await completionApprovalStatement(
  a.DB,
  task,
  { id: a.cid },
  { id: a.manager.memberId, name: "Synthetic reviewer" },
  "Synthetic completion review",
  new Date().toISOString(),
).run();
const publicRoot = path.resolve("public");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
let base;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, base);
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await worker.fetch(
        new Request(url, {
          method: req.method,
          headers: {
            ...req.headers,
            origin: base,
            "oai-authenticated-user-id": owner.id,
            "oai-authenticated-user-email": owner.email,
          },
          body: ["GET", "HEAD"].includes(req.method)
            ? undefined
            : Buffer.concat(chunks),
        }),
        a.env,
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } else {
      const file = path.resolve(
        publicRoot,
        "." +
          (url.pathname === "/"
            ? "/index.html"
            : decodeURIComponent(url.pathname)),
      );
      if (!file.startsWith(publicRoot + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(await fs.readFile(file));
    }
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = {
  at: new Date().toISOString(),
  runtime: process.version,
  synthetic: true,
  views: [],
  screenshots: [],
};
try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      reducedMotion: "reduce",
    });
    // Block all third-party network, including maps/provider traffic.
    await context.route("**/*", (route) =>
      route
        .request()
        .url()
        .startsWith(base + "/")
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage(),
      errors = [],
      failed = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400)
        failed.push([r.url().split("/api/")[1], r.status()]);
    });
    await page.goto(base + "/#overview");
    await page.locator("#main h1").waitFor();
    const views = await page
      .locator("#nav [data-page]")
      .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.dataset.page))]);
    assert.ok(views.length >= 15, "full owner sidebar discovered");
    for (const view of views) {
      if (view === "heritage") continue; // Next public heritage has its own suite.
      if (view !== "overview")
        await Promise.all([
          page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
              url.pathname === "/api/state" &&
              url.searchParams.get("view") === view
            );
          }),
          page.evaluate((view) => {
            location.hash = view;
          }, view),
        ]);
      await page.waitForFunction(
        (view) =>
          document.querySelector("#crumb")?.textContent &&
          location.hash === "#" + view &&
          document.querySelector("#main h1"),
        view,
      );
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      assert.equal(overflow, false, `${view} overflows at ${width}`);
      assert.ok(await page.locator("#main").innerText(), `${view} rendered`);
      evidence.views.push({ view, width });
    }
    await page.evaluate(() => {
      location.hash = "task_approvals";
    });
    await page.locator(".approval-card").waitFor();
    await page.locator('[data-action="approval-open"]').click();
    await page.locator(".approval-detail").waitFor();
    assert.equal(await page.locator("#modal").evaluate((d) => d.scrollTop), 0);
    assert.equal(
      await page
        .locator("#modal")
        .evaluate((d) => d.scrollWidth > d.clientWidth + 1),
      false,
    );
    const screenshot = path.join(os.tmpdir(), `diwan-approval-${width}.png`);
    await page.screenshot({ path: screenshot });
    evidence.screenshots.push(screenshot);
    await page.locator('[data-action="close-modal"]').first().click();
    await page.evaluate(() => {
      location.hash = "tasks";
    });
    await page.locator('[data-action="task-new"]').first().click();
    await page.locator('select[name="reviewer_id"]').waitFor();
    assert.equal(
      await page.locator('select[name="reviewer_id"]').inputValue(),
      a.manager.memberId,
    );
    assert.equal(await page.locator('input[name="dependencies"]').count(), 0);
    assert.equal(await page.locator("#modal").evaluate((d) => d.scrollTop), 0);
    assert.equal(
      await page
        .locator("#modal")
        .evaluate((d) => d.scrollWidth > d.clientWidth + 1),
      false,
    );
    assert.deepEqual(errors, [], `browser errors at ${width}`);
    assert.deepEqual(failed, [], `API errors at ${width}`);
    await context.close();
  }
  await fs.writeFile(
    path.join(os.tmpdir(), "diwan-workspace-browser.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await a.DB.close();
}
