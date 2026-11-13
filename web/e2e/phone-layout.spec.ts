import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

const PAGES = ["/dashboard", "/dashboard/documents", "/dashboard/shared", "/dashboard/profile", "/dashboard/documents/doc-lease"];

for (const width of [360, 390]) {
  test.describe(`on a ${width} px wide phone`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const path of PAGES) {
      test(`${path} never scrolls sideways and keeps its top bar on one row`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator("h1").first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect((await page.locator("header").first().boundingBox())?.height ?? 999).toBeLessThanOrEqual(58);
      });
    }

    test("the document keeps its facts, its Print button and both tabs", async ({ page }) => {
      await page.goto("/dashboard/documents/doc-lease");

      await expect(page.locator("dl[aria-label='About this document']")).toBeVisible();
      await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Ask" })).toBeVisible();
    });

    test("in the Ask tab the question box and the Ask button share a row, with the note under them", async ({ page }) => {
      await page.goto("/dashboard/documents/doc-lease");
      await page.getByRole("tab", { name: "Ask" }).click();

      const question = page.getByRole("textbox", { name: "Your question" });
      const ask = page.getByRole("button", { name: "Ask", exact: true }).last();
      const note = page.locator("p:visible", { hasText: "Explains what the document says. Not legal advice." }).first();
      // Measured until the page stops moving, as the suggested questions load in above.
      await expect
        .poll(async () => {
          const [box, button, text] = await Promise.all([question.boundingBox(), ask.boundingBox(), note.boundingBox()]);
          if (!box || !button || !text) return "missing";
          const sideBySide = button.x >= box.x + box.width - 1 && Math.abs(button.y + button.height / 2 - (box.y + box.height / 2)) < 8;
          const noteBelow = text.y >= box.y + box.height - 1;
          return sideBySide && noteBelow ? "ok" : "not yet";
        })
        .toBe("ok");
      await expect(page.getByRole("list", { name: "Suggested questions" })).toBeVisible();
    });

    test("the Profile page keeps all three limits, Account, the preferences and the Danger zone", async ({ page }) => {
      await page.goto("/dashboard/profile");

      for (const name of ["Account", "Today's limits", "Danger zone"]) {
        await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      }
      for (const label of ["Questions used today", "Document reads used today", "Overviews used today"]) {
        await expect(page.getByRole("progressbar", { name: label })).toBeVisible();
      }
      for (const row of ["Two-step verification", "Share your dashboard", "Bin", "Appearance"]) {
        await expect(page.getByText(row, { exact: true }).first()).toBeVisible();
      }
      await expect(page.getByRole("button", { name: "Delete my account" })).toBeVisible();
    });
  });
}
