import { expect, test } from "@playwright/test";

import { resetFakeApi, seedDocument, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

test("the Dashboard is the first section, with the counts of the person's documents", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveTitle("Dashboard | Brief");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const sections = page.getByRole("navigation", { name: "Sections" }).first();
  await expect(sections.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  const glance = page.getByRole("region", { name: "Your documents at a glance" });
  await expect(glance.getByText("Documents", { exact: true })).toBeVisible();
  await expect(glance.locator("li").filter({ hasText: "Ready to open" }).getByText("2", { exact: true })).toBeVisible();
  await expect(glance.locator("li").filter({ hasText: "Needs attention" }).getByText("0", { exact: true })).toBeVisible();
});

test("a document that could not be read shows up as needing attention, and leads to the documents", async ({ page }) => {
  await seedDocument(page, { id: "doc-broken", filename: "broken-scan.pdf", doc_type: "other", status: "failed", failure_reason: "no_text" });
  await page.goto("/dashboard");

  const card = page.getByRole("region", { name: "Your documents at a glance" }).locator("li").filter({ hasText: "Needs attention" });
  await expect(card.getByText("1", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open your documents" }).click();

  await expect(page).toHaveURL(/\/dashboard\/documents$/);
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("broken-scan.pdf")).toBeVisible();
});

test("the Documents section is unchanged: it still has the upload and the list, at its own address", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Sections" }).first().getByRole("link", { name: "Documents" }).click();

  await expect(page).toHaveURL(/\/dashboard\/documents$/);
  await expect(page.getByRole("heading", { name: "Your contracts" })).toBeVisible();
  await expect(page.getByText("Drop a contract here")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();
});

test("a document's page leads back to the documents list", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");

  await page.getByRole("link", { name: "← Back to your documents" }).click();

  await expect(page).toHaveURL(/\/dashboard\/documents$/);
});
