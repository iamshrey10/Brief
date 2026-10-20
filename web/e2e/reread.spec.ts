import { expect, test } from "@playwright/test";

import { callsMade, resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard");
});

const rowFor = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("region", { name: "Your documents" }).getByRole("listitem").filter({ hasText: name });

test("Read again asks first, and after confirming the document is read again and becomes Ready by itself", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Read sample-lease.pdf again" }).click();
  const confirmation = page.getByRole("group", { name: "Read sample-lease.pdf again" });
  await expect(confirmation.getByText("This replaces what Brief read before")).toBeVisible();
  await confirmation.getByRole("button", { name: "Read again", exact: true }).click();

  const row = rowFor(page, "sample-lease.pdf");
  await expect(row.getByText("Processing")).toBeVisible();
  await expect(row.getByText("Ready")).toBeVisible({ timeout: 15_000 });

  const calls = await callsMade(page);
  expect(calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual([
    "/documents/doc-lease/reread",
  ]);
});

test("cancelling Read again changes nothing", async ({ page }) => {
  await page.getByRole("button", { name: "Read sample-lease.pdf again" }).click();
  await page.getByRole("group", { name: "Read sample-lease.pdf again" }).getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("group", { name: "Read sample-lease.pdf again" })).toHaveCount(0);
  await expect(rowFor(page, "sample-lease.pdf").getByText("Ready")).toBeVisible();
});
