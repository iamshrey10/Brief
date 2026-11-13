import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, seedAdmin, signalsReceived, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the owner sees how Brief is used, as counts, and nothing that names a person or a document", async ({ page }) => {
  await seedAdmin(page);

  await page.goto("/dashboard/admin");

  await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
  await expect(page.getByText(/counts only/)).toBeVisible();
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByText("Signed up")).toBeVisible();
  await expect(people.getByRole("table", { name: "People active each day" })).toBeAttached();
  await expect(page.getByRole("region", { name: "Documents" })).toContainText("Education loans");
  await expect(page.getByRole("region", { name: "Questions, reads and overviews" })).toContainText("210");
  await expect(page.getByRole("region", { name: "Why people came" })).toContainText("Check a lease");
  // The page header shows the signed in person's own address. What the page itself reports holds no address and no file name.
  const reported = (await page.locator('section[aria-labelledby^="admin-"]').allInnerTexts()).join("\n");
  expect(reported.length).toBeGreaterThan(200);
  expect(reported).not.toMatch(/@|\.pdf|\.jpg/i);
});

test("anyone else is told the page is not there", async ({ page }) => {
  const response = await page.goto("/dashboard/admin");

  expect(response?.status()).toBe(404);
  await expect(page.getByText("Signed up")).toHaveCount(0);
});

test("the way in is on the Profile page, for the owner only", async ({ page }) => {
  await page.goto("/dashboard/profile");
  await expect(page.getByRole("link", { name: /^Admin/ })).toHaveCount(0);

  await seedAdmin(page);
  await page.goto("/dashboard/profile");
  await page.getByRole("link", { name: /^Admin/ }).click();

  await expect(page).toHaveURL(/\/dashboard\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
});

test("the admin page has no accessibility violations in light or dark mode", async ({ page }) => {
  await seedAdmin(page);
  await page.goto("/dashboard/admin");
  await expect(page.getByRole("region", { name: "People", exact: true })).toBeVisible();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByRole("region", { name: "People", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test.describe("the signal that Brief is open", () => {
  test("is sent as soon as a signed in page opens", async ({ page }) => {
    await page.goto("/dashboard");

    await expect.poll(() => signalsReceived(page)).toBeGreaterThanOrEqual(1);
  });

  test("is not sent from the landing page, where nobody is signed in to be counted", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await page.waitForTimeout(800);

    expect(await signalsReceived(page)).toBe(0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the admin page fits, with no sideways scrolling", async ({ page }) => {
    await seedAdmin(page);
    await page.goto("/dashboard/admin");
    await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();

    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
    for (const name of ["People", "Time in Brief", "Documents", "Questions, reads and overviews", "Why people came"]) {
      const box = await page.getByRole("region", { name, exact: true }).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/admin-phone.png`, fullPage: true });
  });
});

test("the admin page looks right on a laptop", async ({ page }) => {
  await seedAdmin(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard/admin");
  await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/admin-laptop.png`, fullPage: true });
});
