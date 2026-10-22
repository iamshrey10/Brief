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

test("a reader who has used every question is told so, and asking anyway gets the API's own sentence and a reference code", async ({
  page,
}) => {
  await signInAsTestReader(page, "no-quota");
  await openAsk(page);
  await expect(page.getByText("You have used all of today's questions. Try again tomorrow.")).toBeVisible();

  await page.getByRole("textbox", { name: "Your question" }).fill("What is the security deposit?");
  await page.getByRole("button", { name: "Ask" }).last().click();

  const conversation = page.getByRole("log", { name: "Conversation" });
  await expect(conversation.getByText("You have reached today's limit of 100 questions. Try again tomorrow.")).toBeVisible();
  await expect(conversation.getByText(/^Reference: [0-9a-f]{8}$/)).toBeVisible();
  await expect(conversation.getByText(/The deposit is \$1,450/)).toHaveCount(0);
});
