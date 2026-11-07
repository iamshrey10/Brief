import { expect, test, type Page } from "@playwright/test";

import { callsMade, resetFakeApi, signInAsTestReader, uploadsReceived } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard/documents");
});

const PDF = { name: "new-lease.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 a tiny made up file") };

async function choose(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel("Choose a file to upload").setInputFiles(file);
}

test("uploading a PDF sends it to storage, and the document goes from Processing to Ready by itself", async ({ page }) => {
  await choose(page, PDF);
  await expect(page.getByText("new-lease.pdf")).toBeVisible();
  await page.locator("fieldset").getByText("Lease", { exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  const documents = page.getByRole("region", { name: "Your documents" });
  const row = documents.getByRole("listitem").filter({ hasText: "new-lease.pdf" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/^Lease/)).toBeVisible();
  await expect(row.getByText("Processing")).toBeVisible();
  await expect(page.getByRole("region", { name: "Now reading" }).getByText("new-lease.pdf")).toBeVisible(); // the same timeline as on the Dashboard
  await expect(row.getByText("Ready")).toBeVisible({ timeout: 15_000 });

  expect(await uploadsReceived(page)).toEqual([
    { id: "doc-new-1", contentType: "application/pdf", bytes: PDF.buffer.length },
  ]);
});

test("a file of the wrong kind is turned away on the spot, and nothing is sent anywhere", async ({ page }) => {
  await choose(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("just some notes") });

  await expect(page.locator("form").getByRole("alert")).toHaveText("That kind of file isn't supported. Use a PDF, JPG, PNG, or HEIC.");
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();
  expect((await callsMade(page)).filter((call) => call.method === "POST" && !call.path.startsWith("/me/2fa"))).toEqual([]);
  expect(await uploadsReceived(page)).toEqual([]);
});

test("a refusal for the document limit shows the server's own sentence and a reference code, and adds nothing to the list", async ({
  page,
}) => {
  await choose(page, { ...PDF, name: "limit-lease.pdf" });
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  const alert = page.locator("form").getByRole("alert");
  await expect(alert).toContainText("You can keep up to 25 documents. Delete one you no longer need to upload another.");
  await expect(alert).toContainText(/Reference: [0-9a-f]{8}$/);
  const documents = page.getByRole("region", { name: "Your documents" });
  await expect(documents.getByRole("listitem")).toHaveCount(2);
  expect(await uploadsReceived(page)).toEqual([]);
});

test("a refusal for the daily limit says so in the API's own words, so the person knows to come back tomorrow", async ({
  page,
}) => {
  await choose(page, { ...PDF, name: "daily-lease.pdf" });
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  await expect(page.locator("form").getByRole("alert")).toContainText(
    "You have reached today's limit of 30 document reads. Try again tomorrow.",
  );
  expect(await uploadsReceived(page)).toEqual([]);
});

test("when storage fails the person is told, keeps their chosen file to try again, and the API is never told it arrived", async ({
  page,
}) => {
  await choose(page, { ...PDF, name: "storagefail-lease.pdf" });
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  await expect(page.locator("form").getByRole("alert")).toHaveText("the file upload failed");
  await expect(page.getByText("storagefail-lease.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeEnabled();
  expect((await callsMade(page)).filter((call) => call.path.endsWith("/confirm"))).toEqual([]);
  expect(await uploadsReceived(page)).toEqual([]);
});

test("Try a sample lease sends the made up lease that ships with the site to storage, as a lease, in one click", async ({ page }) => {
  const sample = await page.request.get("/samples/sample-lease.pdf");
  expect(sample.status()).toBe(200);
  expect(sample.headers()["content-type"]).toContain("application/pdf");
  const bytes = (await sample.body()).length;

  await page.getByRole("button", { name: "Try a sample lease" }).click();

  // The fake API already holds a document with this name, so the new one is the second row with it.
  const rows = page.getByRole("region", { name: "Your documents" }).getByRole("listitem").filter({ hasText: "sample-lease.pdf" });
  await expect(rows).toHaveCount(2);
  await expect(rows.first().getByText(/^Lease/)).toBeVisible();
  await expect
    .poll(async () => (await uploadsReceived(page)).map((upload) => `${upload.contentType} ${upload.bytes}`))
    .toEqual([`application/pdf ${bytes}`]);
});

test("an upload can be filed in a folder of its own choosing, and the list says where it is", async ({ page }) => {
  await choose(page, PDF);
  await page.locator("fieldset").getByText("Other", { exact: true }).click();
  await expect(page.getByText(/Not sure where this belongs/)).toBeVisible();
  await page.getByLabel("Folder").selectOption("Personal_Documents");
  await expect(page.getByText(/Not sure where this belongs/)).toHaveCount(0);
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  const row = page.getByRole("region", { name: "Your documents" }).getByRole("listitem").filter({ hasText: "new-lease.pdf" });
  await expect(row).toContainText("In Personal documents");
});

test("adding a document says so, and when it is ready a note with a link to it appears on whatever page the person has moved to", async ({ page }) => {
  await choose(page, PDF);
  await page.locator("fieldset").getByText("Lease", { exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  const notes = page.getByRole("region", { name: "Notifications" });
  await expect(notes.getByText("Added new-lease.pdf")).toBeVisible();
  await expect(notes.getByText("Short files take seconds, long ones a minute or two.")).toBeVisible();

  // The person goes elsewhere while it is read.
  await page.getByRole("navigation", { name: "Sections" }).first().getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile/);

  await expect(notes.getByText("new-lease.pdf is ready")).toBeVisible({ timeout: 20_000 });
  await notes.getByRole("link", { name: "View document" }).click();
  await expect(page).toHaveURL(/\/dashboard\/documents\/doc-new-1$/);
});

test("the notes have no accessibility problems while they are showing", async ({ page }) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await choose(page, PDF);
  await page.locator("fieldset").getByText("Lease", { exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const notes = page.getByRole("region", { name: "Notifications" });
  await expect(notes.getByText("Added new-lease.pdf")).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));

  const results = await new AxeBuilder({ page }).include("section[aria-label=Notifications]").analyze();

  expect(results.violations).toEqual([]);
});

test("the Dashboard shows the steps a document goes through while it is read, and offers it when it is ready", async ({ page }) => {
  await page.goto("/dashboard/documents");
  await page.getByLabel("Choose a file to upload").setInputFiles(PDF);
  await page.locator("fieldset").getByText("Lease", { exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const reading = page.getByRole("region", { name: "Now reading" });
  await expect(reading.getByText("new-lease.pdf")).toBeVisible();
  await expect(reading.getByRole("list", { name: "Steps for new-lease.pdf" }).getByRole("listitem")).toHaveCount(4);

  await expect(reading.getByRole("link", { name: "View document" })).toBeVisible({ timeout: 25_000 });
  await expect(reading.getByRole("list", { name: "Steps for new-lease.pdf" })).toContainText("Ready (done)");
});
