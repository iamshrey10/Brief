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

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await resetFakeApi(page);
      await signInAsTestReader(page);
    });

    test("the dashboard has no automatically detectable accessibility problems", async ({ page }) => {
      await page.goto("/dashboard/documents");
      await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });

    test("the Dashboard home has no automatically detectable accessibility problems", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page.getByRole("region", { name: "What Brief found" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Still to ask" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Coming up" })).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });

    test("the Profile page has no automatically detectable accessibility problems", async ({ page }) => {
      await page.goto("/dashboard/profile");
      await expect(page.getByRole("region", { name: "Today's limits" }).getByRole("progressbar")).toHaveCount(3);

      expect(await problems(page)).toEqual([]);
    });

    test("the document Overview has no automatically detectable accessibility problems", async ({ page }) => {
      await page.goto("/dashboard/documents/doc-lease");
      await expect(page.getByRole("region", { name: "Key terms" }).getByText("Security deposit")).toBeVisible();
      await expect(page.getByRole("region", { name: "Before you sign" }).getByText("The document doesn't say.")).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });

    test("the Ask tab has no automatically detectable accessibility problems", async ({ page }) => {
      await page.goto("/dashboard/documents/doc-lease");
      await page.getByRole("tab", { name: "Ask" }).click();
      await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();

      expect(await problems(page)).toEqual([]);
    });
  });
}
