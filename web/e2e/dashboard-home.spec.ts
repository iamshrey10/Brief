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

test("the Dashboard shows what is coming up, the recent activity and the mix of kinds", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("region", { name: "Coming up" }).getByRole("link", { name: /Lease ends in \d+ days/ })).toBeVisible();
  const activity = page.getByRole("region", { name: "Recent activity" });
  await expect(activity.getByText("sample-lease.pdf")).toBeVisible();
  await expect(activity.getByText("Ready to open").first()).toBeVisible();
  await activity.getByRole("link", { name: /sample-lease\.pdf/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/documents\/doc-lease$/);

  await page.goBack();
  const kinds = page.getByRole("region", { name: "By kind" });
  await expect(kinds.getByText("Lease", { exact: true })).toBeVisible();
  await expect(kinds.getByText("Education loan", { exact: true })).toBeVisible();
});

test("the Dashboard gathers the questions still to ask and shows what Brief found in each document", async ({ page }) => {
  await page.goto("/dashboard");

  const toAsk = page.getByRole("region", { name: "Still to ask" });
  await expect(toAsk.getByText("2 questions your document leaves open")).toBeVisible();
  await expect(toAsk.getByText("Does this renew automatically, and by what date must I cancel?")).toBeVisible();
  await expect(toAsk.getByRole("link", { name: "sample-lease.pdf" })).toHaveAttribute("href", "/dashboard/documents/doc-lease");

  const found = page.getByRole("region", { name: "What Brief found" });
  await expect(found.getByText("9 of 12 terms")).toBeVisible();
  await expect(found.getByText("7 answered")).toBeVisible();
  await expect(found.getByText("nothing open")).toBeVisible();
  await expect(found.getByRole("progressbar", { name: "Key terms found" }).first()).toHaveAttribute("aria-valuenow", "9");
});

test("a person can add a document right from the Dashboard, and the numbers update by themselves", async ({ page }) => {
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "Add a document" });
  // This person already has documents, so the way in is one button, and it is the first thing on the page.
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Add a document" }).click();
  await expect(page.getByText("Drop a contract here")).toBeVisible();

  await page.getByLabel("Choose a file to upload").setInputFiles({ name: "new-lease.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 a tiny made up file") });
  await card.getByText("Lease", { exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  await expect(card.getByRole("status")).toContainText("new-lease.pdf was added and Brief is reading it now.");
  const documents = page.getByRole("region", { name: "Your documents at a glance" }).locator("li").filter({ hasText: "Documents" }).first();
  await expect(documents.getByText("3", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: "Open Documents" }).click();
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("new-lease.pdf")).toBeVisible();
});

test("the way to add a document comes before the numbers on the Dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  const upload = await page.getByRole("region", { name: "Add a document" }).boundingBox();
  const numbers = await page.getByRole("region", { name: "Your documents at a glance" }).boundingBox();
  expect(upload!.y).toBeLessThan(numbers!.y);
});

test("the sections rise into place, and end fully visible, and do not move for a reader who prefers less motion", async ({ page }) => {
  const wrapper = () => page.getByRole("region", { name: "Your documents at a glance" }).locator("xpath=..");
  const animation = () => wrapper().evaluate((el) => getComputedStyle(el).animationName);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dashboard");
  expect(await animation()).not.toBe("none");
  await expect.poll(async () => wrapper().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  expect(await animation()).toBe("none");
  await expect(page.getByRole("region", { name: "Your documents at a glance" })).toBeVisible();
});
