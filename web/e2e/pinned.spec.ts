import { expect, test } from "@playwright/test";

import { resetFakeApi, seedDocument, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

test("scrolling the document leaves the tools still, and scrolling the tools leaves the document still", async ({ page }) => {
  await seedDocument(page, { id: "doc-long", filename: "long.pdf", doc_type: "lease", status: "ready" });
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto("/dashboard/documents/doc-long");
  const tools = page.getByRole("tablist", { name: "Document tools" });
  await expect(tools).toBeVisible();
  const overview = page.getByRole("region", { name: "Key terms" });
  await expect(overview).toBeVisible();
  // Make the Overview long enough to scroll on its own.
  await page.evaluate(() => {
    const panel = document.querySelector("#panel-overview .overflow-y-auto") as HTMLElement;
    panel.firstElementChild!.setAttribute("style", "min-height: 4000px");
  });
  const scrollTops = () =>
    page.evaluate(() => ({
      page: window.scrollY,
      left: (document.querySelector("#panel-overview .overflow-y-auto") as HTMLElement).scrollTop,
      right: (document.querySelector('section[aria-label="Document text"]')!.parentElement as HTMLElement).scrollTop,
    }));
  const toolsTop = (await tools.boundingBox())!.y;

  await page.getByRole("search").hover();
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(400);
  let now = await scrollTops();
  expect(now.right).toBeGreaterThan(300);
  expect(now.left).toBe(0);
  expect(now.page).toBe(0);
  expect(Math.abs((await tools.boundingBox())!.y - toolsTop)).toBeLessThan(2);

  const rightBefore = now.right;
  await overview.hover();
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(400);
  now = await scrollTops();
  expect(now.left).toBeGreaterThan(300);
  expect(now.right).toBe(rightBefore);
  expect(now.page).toBe(0);
});
