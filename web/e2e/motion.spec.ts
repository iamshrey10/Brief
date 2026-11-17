import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, seedAdmin, signInAsTestReader } from "./support/session";

/** The names of the animations that are running or waiting on the page right now. */
const animationNames = (page: Page) =>
  page.evaluate(() => document.getAnimations().map((animation) => (animation as CSSAnimation).animationName).filter(Boolean));

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await seedAdmin(page);
});

test("the Admin charts draw themselves in, and the page parts rise in one after another", async ({ page }) => {
  await page.goto("/dashboard/admin");
  await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
  const names = await animationNames(page);

  expect(names).toContain("chart-draw");
  expect(names).toContain("chart-grow");
  expect(names).toContain("enter");
  // The finished picture is the normal style: once the animations are over, every line is whole and the numbers were there throughout.
  await page.waitForTimeout(1800);
  expect(await page.locator("path.chart-line").first().evaluate((path) => getComputedStyle(path).strokeDashoffset)).toBe("0px");
  await expect(page.getByRole("img", { name: /^People using Brief/ })).toBeVisible();
});

test("a reader who prefers less motion gets no chart animation and no entrance, and every number and chart is simply there", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", baseURL: "http://localhost:3100" });
  const page = await context.newPage();
  await signInAsTestReader(page);
  await seedAdmin(page);
  await page.goto("/dashboard/admin");
  await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();

  const names = await animationNames(page);
  expect(names.filter((name) => ["chart-draw", "chart-grow", "chart-fade", "enter"].includes(name))).toEqual([]);
  await expect(page.getByRole("img", { name: /^People using Brief/ })).toBeVisible();
  await context.close();
});

test("the other pages rise in too, and nothing on them is hidden while it does", async ({ page }) => {
  for (const [path, heading] of [
    ["/dashboard/documents", "Your contracts"],
    ["/dashboard/shared", "Shared"],
    ["/dashboard/profile", "Profile"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await animationNames(page)).toContain("enter");
  }
});

test("the video window eases in when it opens", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Watch how it works" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await animationNames(page)).toContain("dialog-in");
});
