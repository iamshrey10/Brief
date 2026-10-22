import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page, "flaky");
  await page.goto("/dashboard/documents/doc-lease");
});

test("when one section of the Overview fails it says so with a reference code, and the other section still shows", async ({
  page,
}) => {
  const keyTerms = page.getByRole("region", { name: "Key terms" });
  const alert = keyTerms.getByRole("alert");

  await expect(alert).toContainText("I couldn't read this document just now. Try again in a moment.");
  await expect(alert).toContainText(/Reference: [0-9a-f]{8}/);
  const checklist = page.getByRole("region", { name: "Before you sign" });
  await expect(checklist.getByText("How much is the deposit and when do I get it back?")).toBeVisible();
});

test("Try again reads the failed section again and the key terms appear", async ({ page }) => {
  const keyTerms = page.getByRole("region", { name: "Key terms" });
  await expect(keyTerms.getByRole("alert")).toBeVisible();

  await keyTerms.getByRole("button", { name: "Try again" }).click();

  await expect(keyTerms.getByText("Security deposit")).toBeVisible();
  await expect(keyTerms.getByRole("alert")).toHaveCount(0);
});
