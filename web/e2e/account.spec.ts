import { expect, test } from "@playwright/test";

import { FAKE_API, resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard/profile");
});

test("signing out returns to the landing page and the dashboard is closed again", async ({ page }) => {
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.goto("/dashboard/documents");
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test("deleting the account needs the word DELETE typed, then removes it and signs out", async ({ page, request }) => {
  await page.getByRole("button", { name: "Delete my account" }).click();
  const confirmation = page.getByRole("group", { name: "Delete your account" });
  const confirm = confirmation.getByRole("button", { name: "Delete everything" });
  const word = confirmation.getByLabel(/Type DELETE to confirm/);

  await expect(confirm).toBeDisabled();
  await word.fill("delete");
  await expect(confirm).toBeDisabled();
  await word.fill("DELETE");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  const state = (await (await request.get(`${FAKE_API}/__account-deleted`)).json()) as { deleted: boolean };
  expect(state.deleted).toBe(true);
  await page.goto("/dashboard/documents");
  expect(new URL(page.url()).pathname).toBe("/");
});

test("cancelling the account deletion keeps everything and signs nobody out", async ({ page, request }) => {
  await page.getByRole("button", { name: "Delete my account" }).click();
  const confirmation = page.getByRole("group", { name: "Delete your account" });
  await confirmation.getByLabel(/Type DELETE to confirm/).fill("DELETE");
  await confirmation.getByRole("button", { name: "Cancel" }).click();

  await expect(confirmation).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/dashboard/profile");
  await page.goto("/dashboard/documents");
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();
  const state = (await (await request.get(`${FAKE_API}/__account-deleted`)).json()) as { deleted: boolean };
  expect(state.deleted).toBe(false);
});
