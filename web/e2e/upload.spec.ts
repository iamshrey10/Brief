import { expect, test, type Page } from "@playwright/test";

import { callsMade, resetFakeApi, signInAsTestReader, uploadsReceived } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  await page.goto("/dashboard");
});

const PDF = { name: "new-lease.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 a tiny made up file") };

async function choose(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel("Choose a file to upload").setInputFiles(file);
}

test("uploading a PDF sends it to storage, and the document goes from Processing to Ready by itself", async ({ page }) => {
  await choose(page, PDF);
  await expect(page.getByText("new-lease.pdf")).toBeVisible();
  await page.getByText("Lease", { exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  const documents = page.getByRole("region", { name: "Your documents" });
  const row = documents.getByRole("listitem").filter({ hasText: "new-lease.pdf" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/^Lease/)).toBeVisible();
  await expect(row.getByText("Processing")).toBeVisible();
  await expect(row.getByText("Ready")).toBeVisible({ timeout: 15_000 });

  expect(await uploadsReceived(page)).toEqual([
    { id: "doc-new-1", contentType: "application/pdf", bytes: PDF.buffer.length },
  ]);
});

test("a file of the wrong kind is turned away on the spot, and nothing is sent anywhere", async ({ page }) => {
  await choose(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("just some notes") });

  await expect(page.locator("form").getByRole("alert")).toHaveText("That kind of file isn't supported. Use a PDF, JPG, PNG, or HEIC.");
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();
  expect((await callsMade(page)).filter((call) => call.method === "POST")).toEqual([]);
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
