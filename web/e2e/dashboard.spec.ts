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

test("deleting a document asks first, and it is gone after a reload while the other one stays", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Delete sample-lease.pdf" }).click();
  const confirmation = page.getByRole("group", { name: "Delete sample-lease.pdf" });
  await expect(confirmation.getByText("It can't be undone.")).toBeVisible();
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText("sample-lease.pdf")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("sample-loan.pdf")).toBeVisible();
  await expect(page.getByText("sample-lease.pdf")).toHaveCount(0);
});

test("cancelling a delete keeps the document", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Delete sample-lease.pdf" }).click();
  await page.getByRole("group", { name: "Delete sample-lease.pdf" }).getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("sample-lease.pdf")).toBeVisible();
  await page.reload();
  await expect(page.getByText("sample-lease.pdf")).toBeVisible();
});

test("pressing Escape backs out of a delete", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Delete sample-lease.pdf" }).click();
  const confirmation = page.getByRole("group", { name: "Delete sample-lease.pdf" });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(confirmation).toHaveCount(0);
  await expect(page.getByText("sample-lease.pdf")).toBeVisible();
});
