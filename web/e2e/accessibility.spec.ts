import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  ["landing page", "/"],
  ["privacy page", "/privacy"],
  ["terms page", "/terms"],
] as const;

for (const [name, path] of PAGES)
  for (const scheme of ["light", "dark"] as const) {
    test(`the ${name} has no automatically detectable accessibility problems in ${scheme} mode`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();

      const summary = results.violations.map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.nodes.length} element(s)`,
      );
      expect(summary).toEqual([]);
      await context.close();
    });
  }
