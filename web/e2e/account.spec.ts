import { expect, test } from "@playwright/test";

import { FAKE_API, resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard");
});

test("signing out returns to the landing page and the dashboard is closed again", async ({ page }) => {
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.goto("/dashboard");
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});
