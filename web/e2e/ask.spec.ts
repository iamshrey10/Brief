import { expect, test } from "@playwright/test";

import { FAKE_API, resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard/documents/doc-lease");
  await page.getByRole("tab", { name: "Ask" }).click();
});

async function ask(page: import("@playwright/test").Page, question: string) {
  await page.getByRole("textbox", { name: "Your question" }).fill(question);
  await page.getByRole("button", { name: "Ask" }).last().click();
}

test("a question gets an answer with its source", async ({ page }) => {
  await ask(page, "What is the security deposit?");

  const conversation = page.getByRole("log", { name: "Conversation" });
  await expect(conversation.getByText("What is the security deposit?")).toBeVisible();
  await expect(conversation.getByText(/The deposit is \$1,450\.00 and is refundable within 30 days/)).toBeVisible();
  await expect(conversation.getByText("From the document")).toBeVisible();
});

test("a question that fails says so in plain words and shows a reference code that finds the request", async ({
  page,
  request,
}) => {
  await ask(page, "Please fail this one");

  const alert = page.getByText(/Something went wrong getting an answer/);
  await expect(alert).toBeVisible();
  const reference = page.getByText(/^Reference: [0-9a-f]{8}$/);
  await expect(reference).toBeVisible();
  const code = (await reference.textContent())!.replace("Reference: ", "");

  // The code is the start of the request id the API was sent, which is what its log lines are tagged with.
  const seen = (await (await request.get(`${FAKE_API}/__requests`)).json()) as {
    method: string;
    path: string;
    requestId: string | null;
  }[];
  const askCall = seen.find((call) => call.method === "POST" && call.path === "/documents/doc-lease/ask");
  expect(askCall?.requestId?.startsWith(code)).toBe(true);
});

test("the question box refuses an empty question", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Ask" }).last()).toBeDisabled();
  await page.getByRole("textbox", { name: "Your question" }).fill("   ");
  await expect(page.getByRole("button", { name: "Ask" }).last()).toBeDisabled();
});

test("clicking the source under an answer highlights the quoted words in the clause and keeps the conversation", async ({
  page,
}) => {
  await ask(page, "What is the security deposit?");
  const conversation = page.getByRole("log", { name: "Conversation" });
  await expect(conversation.getByText("From the document")).toBeVisible();

  await conversation.getByRole("button", { name: /^Page 1 .security deposit of \$1,450\.00/ }).click();

  await expect(page.locator("mark")).toHaveText("security deposit of $1,450.00");
  await expect(page.locator("#clause-c-deposit")).toHaveAttribute("aria-current", "true");
  await expect(conversation.getByText("What is the security deposit?")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
});
