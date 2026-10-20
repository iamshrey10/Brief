import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

test("a signed in person sees their own address and their documents on the dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Your contracts" })).toBeVisible();
  await expect(page.getByText("e2e-reader@example.invalid")).toBeVisible();
  await expect(page.getByText("sample-lease.pdf")).toBeVisible();
  await expect(page.getByText("sample-loan.pdf")).toBeVisible();
});
