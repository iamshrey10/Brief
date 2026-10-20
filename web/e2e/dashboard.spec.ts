import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

let reader = "";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  reader = await signInAsTestReader(page);
});

test("a signed in person sees their own address and their documents on the dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Your contracts" })).toBeVisible();
  await expect(page.getByText(reader)).toBeVisible();
  await expect(page.getByText("sample-lease.pdf")).toBeVisible();
  await expect(page.getByText("sample-loan.pdf")).toBeVisible();
});
