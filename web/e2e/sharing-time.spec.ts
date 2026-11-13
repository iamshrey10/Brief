import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, seedSharedDashboard, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

/** The friend opens the link and enters the right code, as in the other sharing tests. */
async function friendJoins(page: Page, link: string) {
  await page.goto(new URL(link).pathname);
  await page.getByLabel("Six digit code").fill("482913");
  await page.getByRole("button", { name: "Ask for access" }).click();
  await expect(page.getByRole("status")).toContainText("Your request was sent to");
}

test("the time is chosen with the invitation, starts at approval, can be changed, and is shown", async ({ page }) => {
  await page.goto("/dashboard/shared#sharing");
  await page.getByLabel(/Who is it for/).fill("Mum");
  await expect(page.getByLabel("How long can they look?")).toHaveValue("168");
  await page.getByLabel("How long can they look?").selectOption("24");

  const request = page.waitForRequest((r) => r.url().endsWith("/api/backend/shares") && r.method() === "POST");
  await page.getByRole("button", { name: "Create invitation" }).click();
  expect((await request).postDataJSON()).toEqual({ label: "Mum", hours: 24 });
  const fresh = page.getByRole("region", { name: "New invitation" });
  await expect(fresh).toContainText("they can look for 1 day");
  const link = await fresh.getByLabel("Invitation link").inputValue();

  // Before approval the clock has not started: the row says what will happen.
  const row = page.getByRole("list", { name: "People with access" }).getByRole("listitem");
  await expect(row).toContainText("Can look for 1 day once you approve");

  await friendJoins(page, link);
  await page.goto("/dashboard/shared#sharing");
  await page.getByRole("button", { name: "Approve friend@example.com" }).click();
  await expect(row).toContainText("Can view");
  await page.reload();
  await expect(row).toContainText("Ends in 24 hours");

  // More time, counted from now.
  await row.getByRole("button", { name: /Change the time for/ }).click();
  await page.getByLabel("Give them time from now").selectOption("2160");
  await page.getByRole("button", { name: "Save time" }).click();
  await expect(row).toContainText("Ends in 90 days");
  await expect(page.getByRole("button", { name: "Save time" })).toHaveCount(0);
});

test("a day can be picked on a calendar, and the button waits for it", async ({ page }) => {
  await page.goto("/dashboard/shared#sharing");
  await page.getByLabel("How long can they look?").selectOption("date");
  await expect(page.getByRole("button", { name: "Create invitation" })).toBeDisabled();

  const day = page.getByLabel("Last day");
  const min = await day.getAttribute("min");
  expect(min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // A day 12 days on is inside the 90 days offered.
  const picked = new Date(`${min}T12:00:00`);
  picked.setDate(picked.getDate() + 12);
  const text = `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, "0")}-${String(picked.getDate()).padStart(2, "0")}`;
  await day.fill(text);
  await expect(page.getByRole("button", { name: "Create invitation" })).toBeEnabled();

  const request = page.waitForRequest((r) => r.url().endsWith("/api/backend/shares") && r.method() === "POST");
  await page.getByRole("button", { name: "Create invitation" }).click();
  const body = (await request).postDataJSON();
  expect(body.hours).toBeUndefined();
  const end = new Date(body.until);
  expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
  expect(end.getDate()).toBe(picked.getDate());
});

test("a person sees how long they have left, on the list and on the dashboard", async ({ page }) => {
  const ends = new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString();
  await seedSharedDashboard(page, {
    id: "timed-1",
    owner_email: "mum@example.com",
    owner_name: "Asha Rao",
    status: "active",
    access_ends_at: ends,
    dashboard: { owner_email: "mum@example.com", owner_name: "Asha Rao", documents: [], insights: [], key_dates: [] },
  });

  await page.goto("/dashboard/shared");
  await expect(page.getByText("Access: ends in 5 days")).toBeVisible();
  await page.getByRole("link", { name: "View dashboard" }).click();

  await expect(page.getByText("Ends in 5 days")).toBeVisible();
});

test("a person whose time ran out is told it ended, plainly", async ({ page }) => {
  await seedSharedDashboard(page, { id: "ended-1", owner_email: "mum@example.com", owner_name: "Asha Rao", status: "removed", reason: "expired", ended_at: new Date().toISOString() });

  await page.goto("/dashboard/shared/ended-1");

  await expect(page.getByRole("heading", { name: "Your access has ended" })).toBeVisible();
  await expect(page.getByText(/that time is over/)).toBeVisible();
  await expect(page.getByText(/ask them to share it again/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Shared" })).toBeVisible();
});

test("the time choices have no accessibility violations", async ({ page }) => {
  await page.goto("/dashboard/shared#sharing");
  await page.getByLabel("How long can they look?").selectOption("date");

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the time choices fit, with no sideways scrolling, and are easy to tap", async ({ page }) => {
    await page.goto("/dashboard/shared#sharing");
    await page.getByLabel("How long can they look?").selectOption("date");

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const control of [page.getByLabel("How long can they look?"), page.getByLabel("Last day"), page.getByRole("button", { name: "Create invitation" })]) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/share-time-phone.png`, fullPage: false });
  });
});
