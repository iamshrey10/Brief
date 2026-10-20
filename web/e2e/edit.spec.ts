import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Edit sample-lease.pdf" }).click();
});

test("renaming a document changes its name in the list and the new name is still there after a reload", async ({
  page,
}) => {
  const form = page.getByRole("form", { name: "Edit sample-lease.pdf" });
  await page.getByLabel("Name").fill("renamed-lease.pdf");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("renamed-lease.pdf")).toBeVisible();
  await expect(page.getByText("sample-lease.pdf")).toHaveCount(0);
  await expect(form).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("renamed-lease.pdf")).toBeVisible();
  await expect(page.getByText("sample-loan.pdf")).toBeVisible();
});
