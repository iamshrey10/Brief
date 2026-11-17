import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

for (const width of [320, 360, 375, 390]) {
  test(`signed in, on a phone ${width} px wide, the first page does not scroll sideways and every control in the top bar is whole`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await resetFakeApi(page);
    await signInAsTestReader(page);
    await page.goto("/");
    const bar = page.locator("header").first();
    await expect(bar.getByRole("link", { name: "Dashboard" })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // From 360 px up the bar is one row. Only the very narrowest phones need a second.
    if (width >= 360) expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(66);
    for (const control of [bar.getByRole("button", { name: /Dark mode|Light mode/ }), bar.getByRole("link", { name: "Dashboard" }), bar.getByRole("button", { name: "Sign out" })]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(32);
      expect(box.width).toBeGreaterThanOrEqual(32);
    }
  });
}

test("signed out, the top bar stays one row on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  const bar = await page.locator("header").first().boundingBox();
  expect(bar!.height).toBeLessThanOrEqual(66);
});
