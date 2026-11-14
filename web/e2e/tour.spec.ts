import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, seedNoName, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

const TITLES = [
  "Welcome to Brief",
  "Add a document",
  "No contract handy?",
  "Your document, explained",
  "Ask anything about it",
  "Share your dashboard",
  "The Bin keeps your mistakes safe",
  "Keep your account safe",
];

const tour = (page: Page) => page.getByRole("dialog");
const spotlight = (page: Page) => page.locator("[data-tour-spotlight]");

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The highlight sits around the named part of the page, and that part is on the screen. */
async function expectHighlighting(page: Page, name: string) {
  const target = page.locator(`[data-tour="${name}"]`).first();
  await expect(spotlight(page)).toBeVisible();
  await expect
    .poll(async () => {
      const [t, s] = await Promise.all([target.boundingBox(), spotlight(page).boundingBox()]);
      if (!t || !s) return "missing";
      const around = s.x <= t.x + 1 && s.y <= t.y + 1 && s.x + s.width >= t.x + t.width - 1 && s.y + s.height >= t.y + t.height - 1;
      const viewport = page.viewportSize()!;
      const onScreen = t.y >= -1 && t.y < viewport.height;
      return around && onScreen ? "ok" : `around=${around} onScreen=${onScreen}`;
    }, { timeout: 8000 })
    .toBe("ok");
}

test("a new person finishes the welcome page and the tour opens on the dashboard", async ({ page }) => {
  await seedNoName(page);
  await page.goto("/dashboard/welcome");
  await page.getByLabel("First name").fill("Maya");
  await page.getByLabel("Last name").fill("Rao");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(tour(page).getByRole("heading", { name: "Welcome to Brief" })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Next walks through every step, going to each page and pointing at the real part of it", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await expect(tour(page).getByRole("heading", { name: TITLES[0] })).toBeVisible();

  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/dashboard\/documents$/);
  await expect(tour(page).getByRole("heading", { name: TITLES[1] })).toBeVisible();
  await expectHighlighting(page, "upload");

  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(tour(page).getByRole("heading", { name: TITLES[2] })).toBeVisible();
  await expectHighlighting(page, "sample");

  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(tour(page).getByRole("heading", { name: TITLES[3] })).toBeVisible();
  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(tour(page).getByRole("heading", { name: TITLES[4] })).toBeVisible();

  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/dashboard\/shared$/);
  await expect(tour(page).getByRole("heading", { name: TITLES[5] })).toBeVisible();
  await expectHighlighting(page, "sharing");

  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await expect(tour(page).getByRole("heading", { name: TITLES[6] })).toBeVisible();
  await expectHighlighting(page, "bin");

  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(tour(page).getByRole("heading", { name: TITLES[7] })).toBeVisible();
  await expectHighlighting(page, "two-step");

  await tour(page).getByRole("button", { name: "Done" }).click();
  await expect(tour(page)).toHaveCount(0);
});

test("pressing a section while the tour is open does not close it", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await expect(tour(page)).toBeVisible();

  await page.locator("nav[aria-label=Sections]:visible").getByRole("link", { name: "Documents" }).click();

  await expect(page).toHaveURL(/\/dashboard\/documents$/);
  await expect(tour(page)).toBeVisible();
  await expect(tour(page).getByRole("heading", { name: TITLES[0] })).toBeVisible();
});

test("a person who wandered off is offered a way back to the step's page", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/dashboard\/documents$/);

  await page.locator("nav[aria-label=Sections]:visible").getByRole("link", { name: "Shared" }).click();
  await expect(page).toHaveURL(/\/dashboard\/shared$/);
  await expect(tour(page)).toBeVisible();
  await expect(spotlight(page)).toHaveCount(0);

  await tour(page).getByRole("button", { name: "Show me" }).click();
  await expect(page).toHaveURL(/\/dashboard\/documents$/);
  await expectHighlighting(page, "upload");
});

test("a refresh keeps the tour on the same step", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(tour(page).getByRole("heading", { name: TITLES[1] })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/documents$/);

  await page.reload();

  await expect(tour(page).getByRole("heading", { name: TITLES[1] })).toBeVisible();
  await expectHighlighting(page, "upload");
});

test("Back returns to the earlier step and its page", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/dashboard\/documents$/);

  await tour(page).getByRole("button", { name: "Back" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tour(page).getByRole("heading", { name: TITLES[0] })).toBeVisible();
});

test("it closes only when asked, and stays closed on the next pages and after a refresh", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await tour(page).getByRole("button", { name: "Skip tour" }).click();
  await expect(tour(page)).toHaveCount(0);

  await page.goto("/dashboard/profile");
  await page.reload();
  await expect(tour(page)).toHaveCount(0);
});

test("the Escape key closes it", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await expect(tour(page).getByRole("heading", { name: TITLES[0] })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(tour(page)).toHaveCount(0);
});

test("Profile offers the tour again", async ({ page }) => {
  await page.goto("/dashboard/profile");

  await page.getByRole("link", { name: /Take the tour/ }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tour(page).getByRole("heading", { name: TITLES[0] })).toBeVisible();
});

test("nothing moves for a person who asked for less motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard?tour=1");
  await tour(page).getByRole("button", { name: "Next" }).click();
  await expect(spotlight(page)).toBeVisible();

  expect(await spotlight(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s(, 0s)*$/);
});

test("the highlight glides from one part to the next instead of jumping", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await tour(page).getByRole("button", { name: "Next" }).click();
  await expectHighlighting(page, "upload");

  const duration = await spotlight(page).evaluate((el) => getComputedStyle(el).transitionDuration);

  expect(duration).toContain("0.4s");
});

test("the tour card has no accessibility violations on a laptop, light and dark", async ({ page }) => {
  // Measured without the short fade in, because contrast is read from the colours while the card is still see-through.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/dashboard?tour=1");
    await expect(tour(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
    expect(results.violations).toEqual([]);
  }
});

for (const width of [360, 390]) {
  test.describe(`on a ${width} px wide phone`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("every step fits the screen, keeps the bottom bar tappable, points at its part and never scrolls sideways", async ({ page }) => {
      await page.goto("/dashboard?tour=1");
      const targets: Record<number, string> = { 1: "upload", 2: "sample", 5: "sharing", 6: "bin", 7: "two-step" };

      for (let i = 0; i < TITLES.length; i++) {
        await expect(tour(page).getByRole("heading", { name: TITLES[i] })).toBeVisible();
        const box = await tour(page).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(await sidewaysOverflow(page)).toBe(0);
        // The card sits above the bottom bar of sections, so those stay in reach.
        const bar = await page.locator("nav[aria-label=Sections]").last().boundingBox();
        expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y + 1);
        if (targets[i]) await expectHighlighting(page, targets[i]);
        if (i < TITLES.length - 1) await tour(page).getByRole("button", { name: "Next" }).click();
      }
    });

    test("pressing Documents in the bottom bar keeps the tour open", async ({ page }) => {
      await page.goto("/dashboard?tour=1");
      await expect(tour(page)).toBeVisible();

      await page.locator("nav[aria-label=Sections]").last().getByRole("link", { name: "Documents" }).click();

      await expect(page).toHaveURL(/\/dashboard\/documents$/);
      await expect(tour(page)).toBeVisible();
    });
  });
}
