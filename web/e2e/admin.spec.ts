import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import fs from "node:fs";

import { callsMade, FAKE_API, resetFakeApi, seedAdmin, signalsReceived, signInAsTestReader } from "./support/session";

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
  await expect(page.getByText(/These are counts only/)).toBeVisible();
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByText("Signed up")).toBeVisible();
  await expect(page.getByRole("region", { name: "Activity over time" }).getByRole("table", { name: "People using Brief" })).toBeAttached();
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
    for (const name of ["Activity over time", "How far people get", "The demo video", "People", "Documents", "Questions, reads and overviews", "Why people came", "Download a report"]) {
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

test.describe("the new admin page", () => {
  test.beforeEach(async ({ page }) => {
    await seedAdmin(page);
  });

  test("shows the last 30 days at a glance, each number against the 30 before, and draws the charts", async ({ page }) => {
    await page.goto("/dashboard/admin");

    const glance = page.getByLabel("The last 30 days", { exact: true });
    await expect(glance).toContainText("New people");
    await expect(glance.getByText("vs the 30 days before").first()).toBeVisible();
    for (const name of ["People using Brief", "Documents and questions", "Time in Brief", "Visits", "Demo video, opened and finished"]) {
      await expect(page.getByRole("img", { name: new RegExp(`^${name}, over 30 days`) })).toBeVisible();
    }
    await expect(page.getByRole("region", { name: "How far people get" })).toContainText("Came back on another day");
  });

  for (const days of [7, 90]) {
    test(`the ${days} day choice asks the backend for ${days} days and redraws every chart for them`, async ({ page }) => {
      await page.goto("/dashboard/admin");

      await page.getByRole("navigation", { name: "How far back to look" }).getByRole("link", { name: `${days} days` }).click();

      await expect(page).toHaveURL(new RegExp(`/dashboard/admin\\?days=${days}$`));
      await expect(page.getByLabel(`The last ${days} days`, { exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: new RegExp(`^People using Brief, over ${days} days`) })).toBeVisible();
      await expect(page.getByRole("link", { name: `${days} days` })).toHaveAttribute("aria-current", "page");
      expect((await callsMade(page)).map((call) => call.path)).toContain(`/admin/stats?days=${days}`);
    });
  }

  test("an unknown stretch in the address falls back to 30 days", async ({ page }) => {
    await page.goto("/dashboard/admin?days=45");

    await expect(page.getByLabel("The last 30 days", { exact: true })).toBeVisible();
  });

  test("a daily report downloads as a spreadsheet that a spreadsheet can open, holding counts only", async ({ page }) => {
    await page.goto("/dashboard/admin");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download the daily report as a CSV spreadsheet" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^brief-daily-report-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = fs.readFileSync((await download.path())!, "utf8");
    expect(text).toContain("Brief report,Day,");
    expect(text).toContain("Questions asked,22");
    expect(text).toContain("Check a lease,2");
    expect(text).not.toMatch(/@|\.pdf|\.jpg/i);
    await expect(page.getByRole("status").filter({ hasText: "Saved the daily report" })).toBeVisible();
  });

  test("a monthly report downloads as a PDF, for the month chosen", async ({ page }) => {
    await page.goto("/dashboard/admin");
    // The page sends its "still here" signal once it is ready, and a box filled before then would be reset to its start.
    await expect.poll(() => signalsReceived(page)).toBeGreaterThanOrEqual(1);
    await page.getByLabel("Month", { exact: true }).fill("2026-10");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download the monthly report as a PDF" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("brief-monthly-report-2026-10.pdf");
    const bytes = fs.readFileSync((await download.path())!);
    expect(bytes.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(bytes.length).toBeGreaterThan(500);
    const reports = (await (await page.request.get(`${FAKE_API}/__reports`)).json()) as { period: string; date: string }[];
    expect(reports).toEqual([{ period: "month", date: "2026-10-01" }]);
  });

  test("a report for another day is asked for by the day chosen", async ({ page }) => {
    await page.goto("/dashboard/admin");
    await expect.poll(() => signalsReceived(page)).toBeGreaterThanOrEqual(1);
    await page.getByLabel("Day", { exact: true }).fill("2026-11-05");

    await page.getByRole("button", { name: "Download the daily report as a PDF" }).click();

    await expect.poll(async () => ((await (await page.request.get(`${FAKE_API}/__reports`)).json()) as { date: string }[]).map((r) => r.date)).toEqual(["2026-11-05"]);
  });

  test("the report downloads are not available to anyone but the owner", async ({ page }) => {
    await resetFakeApi(page);
    await signInAsTestReader(page);

    const response = await page.request.get("/api/backend/admin/report?period=day&date=2026-11-12");

    expect(response.status()).toBe(404);
  });

  test("the report route turns away anything that is not a day or a month", async ({ page }) => {
    const response = await page.request.get("/api/backend/admin/report?period=day&date=nonsense");

    expect(response.status()).toBe(400);
  });

  test("passes the accessibility scan in light and dark, with the charts drawn", async ({ page }) => {
    await page.goto("/dashboard/admin");
    await expect(page.getByRole("img", { name: /^People using Brief/ })).toBeVisible();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(page.getByRole("img", { name: /^People using Brief/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("fits a phone, with the range choice and the report buttons easy to hit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/admin");

    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
    for (const link of await page.getByRole("navigation", { name: "How far back to look" }).getByRole("link").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    }
    for (const button of await page.getByRole("region", { name: "Download a report" }).getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    }
  });
});

test.describe("counting the demo video", () => {
  test("opening the video on the landing page counts it, and watching it to the end counts that, with nothing about the visitor", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");

    await page.getByRole("button", { name: "Watch how it works" }).click();
    await expect(page.getByRole("dialog", { name: /^Brief in/ })).toBeVisible();
    await expect.poll(async () => (await (await page.request.get(`${FAKE_API}/__events`)).json()) as string[]).toEqual(["demo_opened"]);

    await page.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));

    await expect.poll(async () => (await (await page.request.get(`${FAKE_API}/__events`)).json()) as string[]).toEqual(["demo_opened", "demo_finished"]);
  });

  test("the counting address takes only the two events, and only a POST", async ({ page }) => {
    expect((await page.request.post("/api/events/demo_opened")).status()).toBe(204);
    expect((await page.request.post("/api/events/anything_else")).status()).toBe(204);
    expect((await page.request.get("/api/events/demo_opened")).status()).toBe(405);

    expect((await (await page.request.get(`${FAKE_API}/__events`)).json()) as string[]).toEqual(["demo_opened"]);
  });
});
