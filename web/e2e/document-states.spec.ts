import { expect, test } from "@playwright/test";

import { resetFakeApi, seedDocument, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

test("a document that could not be read says so and offers no Overview or questions", async ({ page }) => {
  await seedDocument(page, { id: "doc-failed", filename: "failed.pdf", doc_type: "other", status: "failed", failure_reason: "no_text" });
  await page.goto("/dashboard/documents/doc-failed");

  await expect(page.getByRole("heading", { name: "failed.pdf" })).toBeVisible();
  await expect(page.getByText("We couldn't read this document")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Key terms" })).toHaveCount(0);
});

test("a document still being read says so and offers no Overview or questions yet", async ({ page }) => {
  await seedDocument(page, { id: "doc-busy", filename: "busy.pdf", doc_type: "lease", status: "processing", progress_done: 3, progress_total: 10 });
  await page.goto("/dashboard/documents/doc-busy");

  await expect(page.getByText("Still processing")).toBeVisible();
  await expect(page.getByText("Refresh in a moment")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(0);
});

test("a hard to read scan warns with its reading confidence but still shows the text and the Overview", async ({ page }) => {
  await seedDocument(page, { id: "doc-retake", filename: "blurry.png", doc_type: "lease", status: "needs_retake", ocr_confidence: 41.4 });
  await page.goto("/dashboard/documents/doc-retake");

  await expect(page.getByText("This looks like a hard-to-read scan")).toBeVisible();
  await expect(page.getByText(/reading confidence 41%/)).toBeVisible();
  await expect(page.getByText("Tenant shall pay a security deposit of $1,450.00 at signing.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
});

test("a document that finished but has no text says no readable text was found", async ({ page }) => {
  await seedDocument(page, { id: "doc-empty", filename: "empty.pdf", doc_type: "other", status: "ready" });
  await page.goto("/dashboard/documents/doc-empty");

  await expect(page.getByText("No readable text found")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(0);
});

test("when the server cannot load a document the page says so plainly and shows nothing else", async ({ page }) => {
  await seedDocument(page, { id: "doc-down", filename: "down.pdf", doc_type: "other", status: "ready" });
  await page.goto("/dashboard/documents/doc-down");

  await expect(page.getByText("We couldn't load this document")).toBeVisible();
  await expect(page.getByText("The server did not respond. Try again in a moment.")).toBeVisible();
  await expect(page.getByText("the database is unavailable")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(0);
});
