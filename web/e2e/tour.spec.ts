import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, seedNoName, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

const TITLES = [
  "Welcome to Brief",
  "Add a document",
  "Your document, explained",
  "Ask anything about it",
  "Share your dashboard",
  "The Bin keeps your mistakes safe",
  "Keep your account safe",
];

test("a new person finishes the welcome page and the tour opens, then walks through every card to Done", async ({ page }) => {
  await seedNoName(page);
  await page.goto("/dashboard/welcome");
  await page.getByLabel("First name").fill("Maya");
  await page.getByLabel("Last name").fill("Rao");
  await page.getByRole("button", { name: "Continue" }).click();

  const tour = page.getByRole("dialog");
  for (const [i, title] of TITLES.entries()) {
    await expect(tour.getByRole("heading", { name: title })).toBeVisible();
    await expect(tour.getByText(`Step ${i + 1} of ${TITLES.length}`)).toBeVisible();
    if (i < TITLES.length - 1) await tour.getByRole("button", { name: "Next" }).click();
  }
  await tour.getByRole("button", { name: "Done" }).click();

  await expect(tour).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
});

test("the tour does not open on an ordinary visit, and does not come back after a refresh once skipped", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/dashboard?tour=1");
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Profile offers the tour again", async ({ page }) => {
  await page.goto("/dashboard/profile");

  await page.getByRole("link", { name: /Take the tour/ }).click();

  await expect(page.getByRole("dialog", { name: "Welcome to Brief" })).toBeVisible();
});

test("a card's button goes to the place it describes", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("link", { name: "Go to Documents" }).click();

  await expect(page).toHaveURL(/\/dashboard\/documents$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try a sample lease" })).toBeVisible();
});

test("the Escape key closes it", async ({ page }) => {
  await page.goto("/dashboard?tour=1");
  // The tour takes focus once the page is ready to react to keys.
  await expect(page.getByRole("heading", { name: "Welcome to Brief" })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the tour has no accessibility violations on a laptop, light and dark", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/dashboard?tour=1");
    await expect(page.getByRole("dialog")).toBeVisible();
    const results = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
    expect(results.violations).toEqual([]);
  }
});

for (const width of [360, 390]) {
  test.describe(`on a ${width} px wide phone`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("every card fits the screen, with its buttons reachable and no sideways scroll", async ({ page }) => {
      await page.goto("/dashboard?tour=1");
      const tour = page.getByRole("dialog");

      for (let i = 0; i < TITLES.length; i++) {
        await expect(tour.getByRole("heading", { name: TITLES[i] })).toBeVisible();
        const box = await tour.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(800 + 1);
        expect(await sidewaysOverflow(page)).toBe(0);
        const next = tour.getByRole("button", { name: i === TITLES.length - 1 ? "Done" : "Next" });
        await expect(next).toBeInViewport();
        if (i < TITLES.length - 1) await next.click();
      }
    });
  });
}
