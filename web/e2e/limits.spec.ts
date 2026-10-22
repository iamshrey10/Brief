import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
});

async function openAsk(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/documents/doc-lease");
  await page.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
}

test("the chat box says how many questions are left once only a few remain", async ({ page }) => {
  await signInAsTestReader(page, "low-quota");
  await openAsk(page);

  await expect(page.getByText("2 questions left today")).toBeVisible();
});

test("the chat box says nothing about the limit while there are plenty of questions left", async ({ page }) => {
  await signInAsTestReader(page);
  await openAsk(page);

  await expect(page.getByText(/questions? left today/)).toHaveCount(0);
  await expect(page.getByText(/used all of today's questions/)).toHaveCount(0);
});
