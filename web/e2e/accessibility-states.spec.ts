import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

async function problems(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes
        .map((node) => node.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
}

async function ask(page: Page, question: string) {
  await page.getByRole("textbox", { name: "Your question" }).fill(question);
  await page.getByRole("button", { name: "Ask" }).last().click();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode, with something open or showing`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await resetFakeApi(page);
      await signInAsTestReader(page);
    });

    test("an answer with its source", async ({ page }) => {
      await page.goto("/dashboard/documents/doc-lease");
      await page.getByRole("tab", { name: "Ask" }).click();
      await ask(page, "What is the security deposit?");
      await expect(page.getByText("From the document")).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });

    test("a failed question with its reference code", async ({ page }) => {
      await page.goto("/dashboard/documents/doc-lease");
      await page.getByRole("tab", { name: "Ask" }).click();
      await ask(page, "Please fail this one");
      await expect(page.getByText(/^Reference: [0-9a-f]{8}$/)).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });

    test("the edit form", async ({ page }) => {
      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Edit sample-lease.pdf" }).click();
      await expect(page.getByLabel("Name")).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });

    test("the delete confirmation", async ({ page }) => {
      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Delete sample-lease.pdf" }).click();
      await expect(page.getByRole("group", { name: "Delete sample-lease.pdf" })).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });

    test("the account deletion form", async ({ page }) => {
      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Delete my account" }).click();
      await expect(page.getByRole("group", { name: "Delete your account" })).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });

    test("an upload with a chosen file and a refusal showing", async ({ page }) => {
      await page.goto("/dashboard");
      await page.getByLabel("Choose a file to upload").setInputFiles({
        name: "limit-lease.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 a tiny made up file"),
      });
      await page.getByRole("button", { name: "Upload", exact: true }).click();
      await expect(page.locator("form").getByRole("alert")).toContainText("You can keep up to 25 documents");

      expect(await problems(page)).toEqual([]);
    });

    test("a failed document with its reason", async ({ page }) => {
      await page.goto("/dashboard");
      await page.request.post("http://localhost:3101/__seed-failed");
      await page.reload();
      await expect(page.getByText("No text could be found in this file.")).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });
  });
}
