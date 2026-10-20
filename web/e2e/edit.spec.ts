import { expect, test } from "@playwright/test";

import { callsMade, resetFakeApi, signInAsTestReader } from "./support/session";

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

test("changing the kind of a document shows the new kind in the list, and it is kept after a reload", async ({ page }) => {
  const row = page.getByRole("region", { name: "Your documents" }).getByRole("listitem");
  await page.getByLabel("Kind").selectOption({ label: "Job offer" });
  await page.getByRole("button", { name: "Save" }).click();

  await expect(row.filter({ hasText: "sample-lease.pdf" }).getByText(/^Job offer/)).toBeVisible();
  await page.reload();
  await expect(row.filter({ hasText: "sample-lease.pdf" }).getByText(/^Job offer/)).toBeVisible();
  await expect(row.filter({ hasText: "sample-loan.pdf" }).getByText(/^Education loan/)).toBeVisible();
});

test("Save can only be pressed when something changed and the name is not blank", async ({ page }) => {
  const save = page.getByRole("button", { name: "Save" });
  const name = page.getByLabel("Name");

  await expect(save).toBeDisabled();
  await name.fill("something-else.pdf");
  await expect(save).toBeEnabled();
  await name.fill("sample-lease.pdf");
  await expect(save).toBeDisabled();
  await name.fill("   ");
  await expect(save).toBeDisabled();
});

test("pressing Escape closes the form without saving anything", async ({ page }) => {
  await page.getByLabel("Name").fill("never-saved.pdf");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("form", { name: "Edit sample-lease.pdf" })).toHaveCount(0);
  await expect(page.getByText("sample-lease.pdf")).toBeVisible();
  await expect(page.getByText("never-saved.pdf")).toHaveCount(0);
  expect((await callsMade(page)).filter((call) => call.method === "PATCH")).toEqual([]);
});

test("a save that fails says so with a reference code, and keeps the form open with what was typed", async ({ page }) => {
  await page.getByLabel("Name").fill("boom-lease.pdf");
  await page.getByRole("button", { name: "Save" }).click();

  const form = page.getByRole("form", { name: "Edit sample-lease.pdf" });
  await expect(form.getByRole("alert")).toContainText("Couldn't save that just now. Try again in a moment.");
  await expect(form.getByRole("alert")).toContainText(/Reference: [0-9a-f]{8}$/);
  await expect(page.getByLabel("Name")).toHaveValue("boom-lease.pdf");
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
});
