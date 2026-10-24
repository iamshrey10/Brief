import { expect, test } from "@playwright/test";

test("the landing page says what Brief is and offers to sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Brief");
  await expect(page.getByText("Every clause, explained.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

  await expect(page).toHaveTitle("Brief: Every clause, explained.");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /exact words behind every answer/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Brief");
});
