import { expect, test } from "@playwright/test";

test("the landing page says what Brief is and offers to sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every clause, explained.");
  await expect(page.getByText("Every clause, explained.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

  await expect(page).toHaveTitle("Brief: Every clause, explained.");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /exact words behind every answer/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Brief");
});

test("the top bar's links take you to their sections, and the page has the attribute Next needs for smooth scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-scroll-behavior", "smooth");

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.getByRole("heading", { level: 2, name: "How it works" })).toBeInViewport();

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "What you get" }).click();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.getByRole("heading", { level: 2, name: "What you get" })).toBeInViewport();
});

test("the top bar stays in view after scrolling to the bottom, and the section links are hidden on a phone", async ({ page, browser }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole("link", { name: "Brief." }).first()).toBeInViewport();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phonePage = await phone.newPage();
  await phonePage.goto("/");
  await expect(phonePage.getByRole("navigation", { name: "Sections" })).toBeHidden();
  await phone.close();
});
