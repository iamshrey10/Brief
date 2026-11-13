import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, seedNoName, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await seedNoName(page);
});

/** What the page sends when Continue is pressed. */
async function continueAndCapture(page: Page) {
  const request = page.waitForRequest((r) => r.url().endsWith("/api/backend/me") && r.method() === "PATCH");
  await page.getByRole("button", { name: "Continue" }).click();
  return (await request).postDataJSON();
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("choosing why they came sends that reason along with the name", async ({ page }) => {
  await page.goto("/dashboard/welcome");
  await page.getByLabel("First name").fill("Maya");
  await page.getByLabel("Last name").fill("Rao");

  await page.getByText("Check a lease").click();

  expect(await continueAndCapture(page)).toEqual({ first_name: "Maya", last_name: "Rao", reason: "lease" });
});

test("the question can be skipped, and then no reason is sent", async ({ page }) => {
  await page.goto("/dashboard/welcome");
  await page.getByLabel("First name").fill("Maya");
  await page.getByLabel("Last name").fill("Rao");

  expect(await continueAndCapture(page)).toEqual({ first_name: "Maya", last_name: "Rao" });
});

test("a choice can be made from the keyboard", async ({ page }) => {
  await page.goto("/dashboard/welcome");

  await page.getByRole("radio", { name: /Review a job offer/ }).focus();
  await page.keyboard.press("Space");

  await expect(page.getByRole("radio", { name: /Review a job offer/ })).toBeChecked();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the welcome page fits, with no sideways scrolling, and every choice is easy to tap", async ({ page }) => {
    await page.goto("/dashboard/welcome");
    await expect(page.getByRole("heading", { name: "Welcome to Brief", level: 1 })).toBeVisible();

    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
    for (const label of await page.locator("label:has(input[type=radio])").all()) {
      const box = await label.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    const button = await page.getByRole("button", { name: "Continue" }).boundingBox();
    expect(button!.height).toBeGreaterThanOrEqual(44);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/welcome-phone.png`, fullPage: true });
  });
});

test("the welcome page looks right on a laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard/welcome");
  await expect(page.getByRole("heading", { name: "What happens next" })).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/welcome-laptop.png`, fullPage: true });
});
