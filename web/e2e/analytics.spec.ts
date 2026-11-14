import { expect, test, type Page } from "@playwright/test";

import { signInAsTestReader } from "./support/session";

const GOOGLE = /googletagmanager\.com|google-analytics\.com/;

/** Answers Google's addresses itself and records them, so nothing real is ever contacted. */
async function watchGoogle(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route(GOOGLE, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
  return asked;
}

test("the first page asks before counting a visit, and counts nothing until the answer is yes", async ({ page }) => {
  const asked = await watchGoogle(page);
  await page.goto("/");

  const notice = page.getByRole("region", { name: "Counting visits" });
  await expect(notice).toBeVisible();
  await page.waitForTimeout(600);
  expect(asked).toEqual([]);

  await notice.getByRole("button", { name: "Yes, count it" }).click();
  await expect(notice).toBeHidden();
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(asked[0]).toContain("gtag/js?id=G-E2ETEST123");
});

test("saying no counts nothing, and the notice does not come back", async ({ page }) => {
  const asked = await watchGoogle(page);
  await page.goto("/");
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByRole("region", { name: "Counting visits" })).toBeHidden();

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("region", { name: "Counting visits" })).toBeHidden();
  expect(asked).toEqual([]);
});

test("the notice fits a phone without covering the top of the page or scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const notice = page.getByRole("region", { name: "Counting visits" });
  await expect(notice).toBeVisible();
  const box = (await notice.boundingBox())!;
  expect(box.y).toBeGreaterThan(400);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const name of ["No thanks", "Yes, count it"]) {
    expect((await notice.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("the notice has no accessibility problems", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Counting visits" })).toBeVisible();
  // The page fades in, and a scan taken during the fade reads washed out colours.
  await page.waitForTimeout(800);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("someone who said yes is not counted once they are inside the app, and no notice shows there", async ({ page }) => {
  const asked = await watchGoogle(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Yes, count it" }).click();
  await expect.poll(() => asked.length).toBeGreaterThan(0);

  await signInAsTestReader(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // A full page load has no counting script at all, whatever was chosen on the first page.
  expect(await page.locator("script#google-analytics-script").count()).toBe(0);
  await expect(page.getByRole("region", { name: "Counting visits" })).toBeHidden();
});

test("the choice can be changed on the privacy page", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText("Counting visits is off in this browser.")).toBeVisible();
  await page.getByRole("button", { name: "Turn it on" }).click();
  await expect(page.getByText("Counting visits is on in this browser.")).toBeVisible();
  await page.getByRole("button", { name: "Turn it off" }).click();
  await expect(page.getByText("Counting visits is off in this browser.")).toBeVisible();
});
