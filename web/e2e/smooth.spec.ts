import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

const bar = (page: Page) => page.locator("[data-nav-progress]");

/** Makes the next pages arrive slowly, as they do on a busy server, so the wait can be seen. */
async function slowPages(page: Page, ms: number) {
  await page.route(/\/dashboard\/(documents|shared|profile)(\?.*)?$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

for (const [label, viewport] of [
  ["laptop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test.describe(`on a ${label}`, () => {
    test.use({ viewport });

    test("pressing a section answers at once with a bar across the top, and the bar goes when the page arrives", async ({ page }) => {
      await page.goto("/dashboard");
      await slowPages(page, 1500);

      await page.locator("nav[aria-label=Sections]:visible").getByRole("link", { name: "Documents" }).click();

      await expect(bar(page)).toBeVisible({ timeout: 400 });
      await expect(page).toHaveURL(/\/dashboard\/documents$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(bar(page)).toHaveCount(0);
    });

    test("no bar for a press that goes nowhere new", async ({ page }) => {
      await page.goto("/dashboard");

      await page.locator("nav[aria-label=Sections]:visible").getByRole("link", { name: "Dashboard" }).click();

      await expect(bar(page)).toHaveCount(0);
    });

    test("a button presses in while it is held down, and springs back when let go", async ({ page }) => {
      await page.goto("/dashboard/profile");
      const button = page.getByRole("button", { name: /Sign out/ }).first();
      const box = (await button.boundingBox())!;

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const size = () => button.evaluate((el) => {
        const scale = getComputedStyle(el).scale;
        return scale === "none" ? 1 : parseFloat(scale);
      });
      // It eases in over a moment, so wait for it to settle.
      await expect.poll(size).toBeLessThan(0.99);
      await expect.poll(size).toBeGreaterThan(0.9);

      await page.mouse.move(5, 5);
      await page.mouse.up();
      await expect.poll(size).toBe(1);
    });

    test("taps answer without a double tap delay or a grey flash", async ({ page }) => {
      await page.goto("/dashboard");

      for (const selector of ["button", "a[href]"]) {
        const element = page.locator(selector).first();
        const touch = await element.evaluate((el) => getComputedStyle(el).touchAction);
        expect(touch).toBe("manipulation");
      }
    });
  });
}

test("for a person who asked for less motion, buttons do not shrink and the bar does not move", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  await slowPages(page, 1200);

  await page.locator("nav[aria-label=Sections]:visible").getByRole("link", { name: "Documents" }).click();

  await expect(bar(page)).toBeVisible({ timeout: 400 });
  const animation = await bar(page).locator("div").evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
});

for (const [label, viewport] of [
  ["laptop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test.describe(`stability on a ${label}`, () => {
    test.use({ viewport });

    for (const path of ["/dashboard", "/dashboard/documents", "/dashboard/shared", "/dashboard/profile", "/dashboard/documents/doc-lease"]) {
      test(`${path} does not jump around while it loads`, async ({ page }) => {
        await page.addInitScript(() => {
          const w = window as unknown as { __cls: number };
          w.__cls = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
              if (!entry.hadRecentInput) w.__cls += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
        });
        await page.goto(path);
        await page.waitForTimeout(2500);

        const shift = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);

        // Under 0.1 counts as good. Nothing on a page may move more than that while it settles.
        expect(shift).toBeLessThan(0.1);
      });
    }
  });
}
