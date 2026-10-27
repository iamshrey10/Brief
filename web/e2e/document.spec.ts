import { expect, test } from "@playwright/test";

import { FAKE_API, resetFakeApi, seedDocument, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

test("opening a document shows its name, its clauses and the Overview", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByText("sample-lease.pdf").click();

  await expect(page.getByRole("heading", { name: "sample-lease.pdf" })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/documents\/doc-lease$/);
  await expect(page.getByText("Tenant shall pay a security deposit of $1,450.00 at signing.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Key terms" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Before you sign" })).toBeVisible();
});

test("a key term that rests on two quotes has two numbered buttons, and each shows its own clause", async ({
  page,
}) => {
  await page.goto("/dashboard/documents/doc-lease");
  const keyTerms = page.getByRole("region", { name: "Key terms" });

  const first = keyTerms.getByRole("button", { name: /Show "Security deposit" in the document, page 2, quote 1 of 2/ });
  const second = keyTerms.getByRole("button", { name: /Show "Security deposit" in the document, page 1, quote 2 of 2/ });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();

  await second.click();
  await expect(page.locator("mark")).toContainText("Tenant shall pay a security deposit of $1,450.00 at signing.");
  await first.click();
  await expect(page.locator("mark")).toContainText("The deposit is refundable within 30 days after move-out");
});

test("a question the document does not answer is shown as a gap with wording to ask the other side", async ({
  page,
}) => {
  await page.goto("/dashboard/documents/doc-lease");
  const checklist = page.getByRole("region", { name: "Before you sign" });

  await expect(checklist.getByText("Does it renew by itself, and how much notice is needed to stop it?")).toBeVisible();
  await expect(checklist.getByText("The document doesn't say.")).toBeVisible();
  await expect(checklist.getByText(/Does this renew automatically, and by what date must I cancel\?/)).toBeVisible();
});

test("the website forwards a request id with each call the Overview makes", async ({ page, request }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await expect(page.getByRole("region", { name: "Key terms" }).getByText("Security deposit")).toBeVisible();

  const seen = (await (await request.get(`${FAKE_API}/__requests`)).json()) as {
    path: string;
    requestId: string | null;
  }[];
  const keyTermsCall = seen.find((call) => call.path === "/documents/doc-lease/key-terms");

  expect(keyTermsCall?.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("a document that is not there shows a not found page, not someone else's data", async ({ page }) => {
  const response = await page.goto("/dashboard/documents/doc-nobody");

  expect(response?.status()).toBe(404);
});

test("on a long document the top bar stays in view, and the Overview panel, which sticks while the clauses scroll, sticks below it", async ({
  page,
}) => {
  await seedDocument(page, { id: "doc-long", filename: "long.pdf", doc_type: "lease", status: "ready" });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/dashboard/documents/doc-long");
  await page.evaluate(() => window.scrollTo(0, 1200));

  const bar = page.locator("header").first();
  const tabs = page.getByRole("tablist");
  await expect(bar).toBeInViewport();
  await expect(tabs).toBeInViewport();
  const barBox = (await bar.boundingBox())!;
  const tabsTop = (await tabs.boundingBox())!.y;

  expect(tabsTop).toBeGreaterThanOrEqual(barBox.y + barBox.height);
});
