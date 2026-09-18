import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("real Next page redirects old URL, renders without legacy app or API", async ({
  page,
  request,
}) => {
  const apiRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#heritage");
  await expect(page).toHaveURL(/\/heritage/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "النائلات",
  );
  expect(await page.locator('script[src*="/app.js"]').count()).toBe(0);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
  const response = await request.get("/heritage");
  expect(await response.text()).toContain("للأصالة راية.");
  expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("all original seasons and accessible RTL keyboard navigation", async ({
  page,
}) => {
  await page.goto("/heritage#nailat-achievements");
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await expect(page.getByRole("tabpanel")).toContainText("على درب الإنجاز");
  await tabs.nth(1).click();
  await expect(page.getByRole("tabpanel").locator("article")).toHaveCount(12);
  await tabs.nth(1).press("ArrowLeft");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("صدارة الوضح");
  await tabs.nth(2).press("End");
  await expect(tabs.last()).toBeFocused();
  await expect(page.getByRole("tabpanel").locator("article")).toHaveCount(5);
  await tabs.last().press("Home");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
});

test("anchors, reduced motion, keyboard skip link and accessibility", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/heritage");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "تجاوز المقدمة إلى المحتوى" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#nailat-story$/);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
  await page.getByRole("link", { name: "اكتشف مسيرة النائلات" }).click();
  await expect(page).toHaveURL(/#nailat-achievements$/);
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(report.violations).toEqual([]);
});

test("local workspace entry and membership form remain reachable", async ({
  page,
}) => {
  await page.goto("/heritage");
  await page
    .getByRole("link", { name: "دخول الديوان", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/workspace#overview$/);
  await expect(page.locator("#main .boot")).toHaveCount(0);
  await expect(page.locator("#main")).not.toContainText("تعذر فتح مساحة العمل");
  await page.goto("/heritage");
  await page.getByRole("link", { name: "طلب الانضمام", exact: true }).click();
  await expect(page.locator("#phoneForm")).toBeVisible();
});

test("content remains available without browser JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/heritage`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "النائلات",
  );
  await expect(
    page.getByRole("heading", { name: "تشريفٌ نعتزّ به. وفخرٌ نحمله." }),
  ).toBeVisible();
  await context.close();
});
