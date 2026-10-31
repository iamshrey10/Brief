import { expect, test } from "@playwright/test";

import { FAKE_API, resetFakeApi, seedDocument, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

test("opening a document shows its name, its clauses and the Overview", async ({ page }) => {
  await page.goto("/dashboard/documents");
  await page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf").click();

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

test("printed, the document page is the Overview alone, without the top bar, the tabs or the clause text", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await expect(page.getByRole("region", { name: "Key terms" }).getByText("Security deposit")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();

  await page.emulateMedia({ media: "print" });

  await expect(page.getByRole("region", { name: "Key terms" }).getByText("Security deposit")).toBeVisible();
  await expect(page.getByRole("region", { name: "Before you sign" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "sample-lease.pdf" })).toBeVisible();
  await expect(page.locator("header").first()).toBeHidden();
  await expect(page.getByRole("tablist")).toBeHidden();
  await expect(page.getByRole("region", { name: "Document text" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
});

test("Add the date to your calendar saves a calendar file with the lease end date and a week's reminder", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  const button = page.getByRole("button", { name: /Add this date to your calendar/ });
  await expect(button).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);

  expect(download.suggestedFilename()).toBe("sample-lease-dates.ics");
  const file = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
  expect(file).toContain("BEGIN:VCALENDAR");
  expect(file).toContain("SUMMARY:Lease ends: sample-lease.pdf");
  expect(file).toContain("DTSTART;VALUE=DATE:20991231");
  expect(file).toContain("TRIGGER:-P7D");
  expect(file).toContain("\r\n");
});

test("Email these questions is a link that opens a message with the lease's open questions in it", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");

  const link = page.getByRole("link", { name: "Email these questions" });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href")) ?? "";

  expect(href.startsWith("mailto:?subject=")).toBe(true);
  const decoded = decodeURIComponent(href);
  expect(decoded).toContain("Questions about the lease before I sign");
  expect(decoded).toContain("Does this renew automatically, and by what date must I cancel?");
  expect(decoded).not.toContain("sample-lease.pdf");
});

test("Copy summary puts the summary on the clipboard and Download summary saves it as a PDF", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/dashboard/documents/doc-lease");
  await expect(page.getByRole("region", { name: "Key terms" }).getByText("Security deposit")).toBeVisible();

  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect(page.getByText("Copied. Paste it anywhere.")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("SUMMARY OF MY LEASE, FROM BRIEF");
  expect(copied).toContain("* Security deposit: $1,450.00, refundable within 30 days after move-out (page 2)");
  expect(copied).toContain("Pet policy");
  expect(copied).toContain("1. Does this renew automatically, and by what date must I cancel?");
  expect(copied).not.toContain("sample-lease");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download summary (PDF)" }).click()]);
  expect(download.suggestedFilename()).toBe("sample-lease-summary.pdf");
  const bytes = await (await import("node:fs/promises")).readFile((await download.path())!);
  const text = bytes.toString("latin1");
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  expect(bytes.length).toBeGreaterThan(1500);
  expect(text).not.toContain("sample-lease");
});

test("Find in this document marks matches, steps through them, and stays reachable below the top bar on a long document", async ({ page }) => {
  await seedDocument(page, { id: "doc-long", filename: "long.pdf", doc_type: "lease", status: "ready" });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/dashboard/documents/doc-long");

  const box = page.getByRole("searchbox", { name: "Find in this document" });
  await box.fill("clause 3");
  // "Clause 3", "Clause 30" to "Clause 39" all contain it.
  await expect(page.getByRole("status").filter({ hasText: /^1 of 11$/ })).toBeVisible();

  for (let i = 0; i < 6; i++) await box.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /^7 of 11$/ })).toBeVisible();
  await expect(page.locator('mark[data-find-current="true"]')).toBeInViewport();

  await page.evaluate(() => window.scrollTo(0, 1500));
  const bar = page.getByRole("search").filter({ has: box });
  const header = page.locator("header").first();
  await expect(bar).toBeInViewport();
  const headerBottom = (await header.boundingBox())!.y + (await header.boundingBox())!.height;
  expect((await bar.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom - 1);

  await box.press("Escape");
  await expect(page.locator("mark")).toHaveCount(0);
});
