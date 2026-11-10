import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

// Common screens: small and large laptops (a Windows laptop at 125% or 150% scaling has about 1536x730 or 1280x610), a full HD
// monitor, a tablet and a phone. The question box and the Ask button must be inside the window on every one of them.
const SCREENS = [
  { name: "a laptop at 1366x768 with a browser bar", width: 1366, height: 650 },
  { name: "a Windows laptop at 150% scaling", width: 1280, height: 610 },
  { name: "a short wide window", width: 1600, height: 520 },
  { name: "a full HD monitor", width: 1920, height: 940 },
  { name: "a tall monitor", width: 1440, height: 1300 },
  { name: "a tablet held sideways", width: 1024, height: 700 },
  { name: "a tablet held upright", width: 768, height: 1024 },
  { name: "a phone", width: 390, height: 700 },
];

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

for (const screen of SCREENS) {
  test(`the Ask box and button fit the window on ${screen.name}`, async ({ page }) => {
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto("/dashboard/documents/doc-lease");
    await page.getByRole("tab", { name: "Ask" }).click();

    const box = page.getByRole("textbox", { name: "Your question" });
    const button = page.getByRole("button", { name: "Ask", exact: true }).last();
    await expect(box).toBeVisible();
    // The suggested questions are worked out from the document's key terms and appear a moment after the tab opens. Measure once
    // they are there, so the page has its final height.
    await expect(page.getByRole("list", { name: "Suggested questions" })).toBeVisible();

    // Nothing sticks out of the window sideways, and the page itself does not scroll sideways.
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);

    // Where it is without scrolling the page: on a phone the page scrolls, so it is allowed to be reached by scrolling.
    if (screen.width < 1024) await button.scrollIntoViewIfNeeded();
    for (const element of [box, button]) {
      const rect = (await element.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(screen.width);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(screen.height);
    }

    // On a computer the Ask panel fills the height of the window, like the document beside it, and does not push the page taller.
    if (screen.width >= 1024) {
      const panel = (await page.getByRole("region", { name: "Ask about this document" }).boundingBox())!;
      expect(panel.y + panel.height).toBeGreaterThanOrEqual(screen.height - 48);
      expect(panel.y + panel.height).toBeLessThanOrEqual(screen.height);
      const taller = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(taller).toBeLessThanOrEqual(1);
    }
  });
}

test("a long conversation scrolls inside the panel and the question box stays put", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 650 });
  await page.goto("/dashboard/documents/doc-lease");
  await page.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByRole("list", { name: "Suggested questions" })).toBeVisible();
  const box = page.getByRole("textbox", { name: "Your question" });
  const before = (await box.boundingBox())!;

  for (let i = 0; i < 6; i++) {
    await box.fill(`What is the deposit, question ${i + 1}?`);
    await page.getByRole("button", { name: "Ask", exact: true }).last().click();
    await expect(page.getByRole("log", { name: "Conversation" }).getByText(`question ${i + 1}?`)).toBeVisible();
  }

  const after = (await box.boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  expect(after.y + after.height).toBeLessThanOrEqual(650);
});
