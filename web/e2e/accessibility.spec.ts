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
      // Check the page at rest: let the entrance animations that end finish first (loops that never end are left alone).
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map((animation) => animation.finished),
        ),
      );

      const results = await new AxeBuilder({ page }).analyze();

      const summary = results.violations.map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.nodes.length} element(s)`,
      );
      expect(summary).toEqual([]);
      await context.close();
    });
  }

for (const scheme of ["light", "dark"] as const)
  test(`the landing page's How it works section, once it has come in with its scenes playing, has no problems in ${scheme} mode`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: scheme, reducedMotion: "no-preference", viewport: { width: 1280, height: 700 } });
    const page = await context.newPage();
    await page.goto("/");
    await page.locator("#how").scrollIntoViewIfNeeded();
    await expect(page.locator("#how [data-reveal]")).toHaveAttribute("data-reveal", "shown");
    // The cards come in with transitions. The scenes loop for ever, so only the transitions are waited for.
    await page.evaluate(() =>
      Promise.all(document.getAnimations().filter((animation) => animation instanceof CSSTransition).map((animation) => animation.finished)),
    );

    const results = await new AxeBuilder({ page }).include("#how").analyze();

    expect(results.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.length} element(s)`)).toEqual([]);
    await context.close();
  });
