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
