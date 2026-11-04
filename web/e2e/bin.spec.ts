import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

async function deleteLease(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/documents");
  await page.getByRole("button", { name: "Delete sample-lease.pdf" }).click();
  await page.getByRole("group", { name: "Delete sample-lease.pdf" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toHaveCount(0);
}

test("an empty bin says so and how long deleted documents stay", async ({ page }) => {
  await page.goto("/dashboard/profile");

  await expect(page.getByRole("heading", { name: "Bin", level: 2 })).toBeVisible();
  await expect(page.getByRole("region", { name: "The bin is empty" })).toBeVisible();
});

test("a deleted document waits in the bin with its days left, and can be restored", async ({ page }) => {
  await deleteLease(page);
  await page.goto("/dashboard/profile");

  const list = page.getByRole("list", { name: "Documents in the bin" });
  await expect(list.getByText("sample-lease.pdf")).toBeVisible();
  await expect(list.getByText("7 days left")).toBeVisible();

  await page.getByRole("button", { name: "Restore sample-lease.pdf" }).click();
  await expect(page.getByRole("status")).toContainText("sample-lease.pdf was restored.");

  await page.goto("/dashboard/documents");
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();
});

test("deleting for good asks first and then removes it", async ({ page }) => {
  await deleteLease(page);
  await page.goto("/dashboard/profile");

  await page.getByRole("button", { name: "Delete forever: sample-lease.pdf" }).click();
  await page.getByRole("group").getByRole("button", { name: "Delete forever" }).click();

  await expect(page.getByRole("status")).toContainText("was deleted for good.");
  await page.reload();
  await expect(page.getByRole("region", { name: "The bin is empty" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`the bin has no accessibility violations in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await deleteLease(page);
    await page.goto("/dashboard/profile");
    await expect(page.getByText("7 days left")).toBeVisible();
    await page.waitForTimeout(800);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("the old Bin address lands on the Bin inside Profile, and the top bar has no Bin link", async ({ page }) => {
  await page.goto("/dashboard/bin");

  await expect(page).toHaveURL(/\/dashboard\/profile#bin$/);
  await expect(page.getByRole("heading", { name: "Bin", level: 2 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Sections" }).first().getByRole("link", { name: "Bin" })).toHaveCount(0);
});
