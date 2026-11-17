import { expect, test } from "@playwright/test";

test("an address that does not exist shows Brief's own page, with two ways back, and passes the accessibility scan", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "That page isn't here." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your dashboard" })).toBeVisible();
  await page.waitForTimeout(600);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("link", { name: "Back to the first page" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("on a phone the 404 page fits with no sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/nope");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
