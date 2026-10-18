import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const scheme of ["light", "dark"] as const) {
  test(`the landing page has no automatically detectable accessibility problems in ${scheme} mode`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    const summary = results.violations.map(
      (violation) => `${violation.id} (${violation.impact}): ${violation.nodes.length} element(s)`,
    );
    expect(summary).toEqual([]);
    await context.close();
  });
}
