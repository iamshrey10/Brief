import { expect, test } from "@playwright/test";

import { resetFakeApi, seedDocument, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
  // Enough documents that the Documents page is long, as it is for a real person, so there is room to scroll to the list.
  for (let i = 1; i <= 9; i++) {
    await seedDocument(page, { id: `doc-extra-${i}`, filename: `extra-${i}.pdf`, doc_type: "lease", status: "ready" });
  }
});

for (const [label, viewport] of [
  ["laptop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test.describe(`on a ${label}`, () => {
    test.use({ viewport });

    for (const tile of ["Ready to open", "Documents", "Being read", "Needs attention"]) {
      test(`the ${tile} tile leads to the list of documents, scrolled into view, not to the upload form`, async ({ page }) => {
        await page.goto("/dashboard");

        await page.getByRole("region", { name: "Your documents at a glance" }).getByRole("link", { name: new RegExp(`^${tile}`) }).click();

        await expect(page).toHaveURL(/\/dashboard\/documents#your-documents$/);
        const heading = page.getByRole("heading", { level: 2, name: "Your documents" });
        await expect(heading).toBeInViewport();
        // Near the top of the screen, so the list is what you see, and the upload form has scrolled away above it.
        await expect.poll(async () => (await heading.boundingBox())!.y, { timeout: 5000 }).toBeLessThan(220);
      });
    }

    test("a tile is easy to hit and has a visible focus ring from the keyboard", async ({ page }) => {
      await page.goto("/dashboard");
      const tile = page.getByRole("region", { name: "Your documents at a glance" }).getByRole("link", { name: /^Ready to open/ });

      const box = (await tile.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      await tile.focus();
      await expect(tile).toBeFocused();
    });
  });
}

test("there is no light and dark button on a signed in page, and Appearance is on Profile", async ({ page }) => {
  for (const path of ["/dashboard", "/dashboard/documents", "/dashboard/shared", "/dashboard/profile"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: /^(Light|Dark) mode$/ })).toHaveCount(0);
  }
  await page.goto("/dashboard/profile");
  await expect(page.getByText("Appearance", { exact: true }).first()).toBeVisible();
});

test("the light and dark button is still on the landing page", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("button", { name: /^(Light|Dark) mode$/ })).toBeVisible();
  await context.close();
});
