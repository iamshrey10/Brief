import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard/documents");
});

test("opening the edit form puts the keyboard in the Name box, and closing it returns to the Edit button", async ({
  page,
}) => {
  const edit = page.getByRole("button", { name: "Edit sample-lease.pdf" });
  await edit.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByLabel("Name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
});

test("the delete confirmation starts on Cancel, so a stray Enter cannot delete anything, and closing returns to the Delete button", async ({
  page,
}) => {
  const trash = page.getByRole("button", { name: "Delete sample-lease.pdf" });
  await trash.focus();
  await page.keyboard.press("Enter");

  const confirmation = page.getByRole("group", { name: "Delete sample-lease.pdf" });
  await expect(confirmation.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();
  await expect(trash).toBeFocused();
});

test("the Read again confirmation starts on Cancel and closing returns to the Read again button", async ({ page }) => {
  const again = page.getByRole("button", { name: "Read sample-lease.pdf again" });
  await again.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("group", { name: "Read sample-lease.pdf again" }).getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(again).toBeFocused();
});

test("opening the account deletion puts the keyboard in its box, and closing returns to its button", async ({ page }) => {
  await page.goto("/dashboard/profile");
  const open = page.getByRole("button", { name: "Delete my account" });
  await open.focus();
  await page.keyboard.press("Enter");

  const confirmation = page.getByRole("group", { name: "Delete your account" });
  await expect(confirmation.getByLabel(/Type DELETE to confirm/)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(open).toBeFocused();
});
