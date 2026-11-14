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

  await expect(page).toHaveURL(/\/dashboard\/documents#your-documents$/);
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

  await page.getByRole("link", { name: "Back to your documents" }).click();

  await expect(page).toHaveURL(/\/dashboard\/documents$/);
});

test("the Dashboard shows the recent activity and the mix of kinds", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("region", { name: "Coming up" })).toHaveCount(0);
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

test("the Dashboard has no upload of its own: Add documents leads to the Documents page, where files are uploaded", async ({ page }) => {
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "Add documents" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "Add your documents" })).toBeVisible();
  await expect(card.getByText("Your documents, securely managed in one place.")).toBeVisible();
  await expect(page.getByLabel("Choose a file to upload")).toHaveCount(0);

  await card.getByRole("link", { name: "Add documents" }).click();

  await expect(page).toHaveURL(/\/dashboard\/documents$/);
  await expect(page.getByText("Drop a contract here")).toBeVisible();
});

test("the numbers come first on the Dashboard, then the way to add a document", async ({ page }) => {
  await page.goto("/dashboard");

  const upload = await page.getByRole("region", { name: "Add documents" }).boundingBox();
  const numbers = await page.getByRole("region", { name: "Your documents at a glance" }).boundingBox();
  expect(numbers!.y).toBeLessThan(upload!.y);
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

test("the Dashboard puts what Brief found and the recent activity above the questions still to ask, which come last", async ({ page }) => {
  await page.goto("/dashboard");
  const top = async (name: string) => (await page.getByRole("region", { name }).boundingBox())!.y;

  const found = await top("What Brief found");
  const activity = await top("Recent activity");
  const toAsk = await top("Still to ask");

  expect(found).toBeLessThan(activity);
  expect(activity).toBeLessThan(toAsk);
});

test("the Dashboard shows how long the lease has left, linking to that lease", async ({ page }) => {
  await page.goto("/dashboard");

  const card = page.getByRole("region", { name: "Lease remaining" });
  await expect(card).toContainText(/\d[\d,]* days left/);
  await expect(card).toContainText("Ends December 31, 2099");
  await expect(card.getByRole("link", { name: "sample-lease.pdf" })).toHaveAttribute("href", "/dashboard/documents/doc-lease");
});

test("the bell on the lease reminder hands the date to a calendar file, says it was added, and still says so after a reload", async ({ page }) => {
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "Lease remaining" });

  await card.getByRole("button", { name: "Remind me in my calendar" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download calendar file/ }).click()]);
  expect(download.suggestedFilename()).toBe("sample-lease-lease-end.ics");
  const file = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(file).toString();
  expect(text).toContain("DTSTART;VALUE=DATE:20991231");
  expect(text).toContain("UID:doc-lease-lease_end@brief");

  await expect(card.getByRole("button", { name: "Added to your calendar" })).toBeVisible();
  await page.reload();
  await expect(card.getByRole("button", { name: "Added to your calendar" })).toBeVisible();
  await card.getByRole("button", { name: "Added to your calendar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added to your calendar" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Download calendar file/ })).toHaveCount(0);
});

test.describe("on a phone", () => {
  for (const width of [360, 390]) {
    test(`the top bar keeps Back beside the name on one row at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/dashboard/documents/doc-lease");

      const header = page.locator("header");
      await expect(header.getByRole("link", { name: "Back to your documents" })).toBeVisible();
      // One row of the bar, not two: it stays as tall as it is with no Back button.
      expect((await header.boundingBox())?.height ?? 999).toBeLessThanOrEqual(58);
      // The old row under the bar is gone, so the document's name starts right below it.
      await expect(page.getByText("← Back to your documents")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await header.getByRole("link", { name: "Back to your documents" }).click();
      await expect(page).toHaveURL(/\/dashboard\/documents$/);
    });
  }
});
