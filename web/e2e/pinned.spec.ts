import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

test("the tools on the left stay in view while the document on the right scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto("/dashboard/documents/doc-lease");
  const tools = page.getByRole("tablist", { name: "Document tools" });
  await expect(tools).toBeVisible();
  // Make the document long enough to scroll, as a real contract is.
  await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Document text"]') as HTMLElement;
    section.style.minHeight = "4000px";
  });
  const before = (await tools.boundingBox())!.y;
  await page.getByRole("search").hover();
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(400);
  const after = (await tools.boundingBox())!.y;
  expect(Math.abs(after - before)).toBeLessThan(2);
});
