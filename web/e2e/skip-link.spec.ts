import { expect, test } from "@playwright/test";

test("the first thing the keyboard reaches is a Skip to main content link, hidden until it has focus", async ({ page }) => {
  await page.goto("/privacy");
  const skip = page.getByRole("link", { name: "Skip to main content" });

  await expect(skip).not.toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
});

test("using it moves focus into the main content, past the page's top controls", async ({ page }) => {
  await page.goto("/privacy");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(page.locator("main#main-content")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "← Back to Brief" })).toBeFocused();
});

test("it is on the landing page too, where the theme button comes before the content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});
