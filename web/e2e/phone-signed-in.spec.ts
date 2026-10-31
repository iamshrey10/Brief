import { expect, test, type Page } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  await signInAsTestReader(page);
});

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the dashboard fits a phone, with the whole file name readable and no sideways scrolling", async ({ page }) => {
  await page.goto("/dashboard/documents");
  await expect(page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf")).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  const name = await page.getByRole("region", { name: "Your documents" }).getByText("sample-lease.pdf").boundingBox();
  expect(name!.x).toBeGreaterThanOrEqual(0);
  expect(name!.x + name!.width).toBeLessThanOrEqual(390);
});

test("the Profile page fits a phone, with the three sections on a row of their own and no sideways scrolling", async ({ page }) => {
  await page.goto("/dashboard/profile");
  await expect(page.getByRole("region", { name: "Today's limits" })).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  const sections = page.getByRole("navigation", { name: "Sections" }).filter({ visible: true });
  await expect(sections).toHaveCount(1);
  const links = await sections.getByRole("link").all();
  expect(links).toHaveLength(3);
  const boxes = await Promise.all(links.map((link) => link.boundingBox()));
  // All three on one row, and the last one inside the screen.
  expect(new Set(boxes.map((box) => box!.y)).size).toBe(1);
  const last = boxes[2]!;
  expect(last.x + last.width).toBeLessThanOrEqual(390);
});

test("the dashboard's summary of documents fits a phone", async ({ page }) => {
  await page.goto("/dashboard/documents");

  const summary = page.getByRole("group", { name: "Your documents at a glance" });
  await expect(summary).toBeVisible();
  const box = await summary.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test("the document page fits a phone on the Overview", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await expect(page.getByRole("region", { name: "Key terms" }).getByText("Security deposit")).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("the document page fits a phone on the Ask tab", async ({ page }) => {
  await page.goto("/dashboard/documents/doc-lease");
  await page.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("a delete confirmation fits a phone and its buttons can be reached", async ({ page }) => {
  await page.goto("/dashboard/documents");
  await page.getByRole("button", { name: "Delete sample-lease.pdf" }).click();

  const group = page.getByRole("group", { name: "Delete sample-lease.pdf" });
  await expect(group.getByRole("button", { name: "Cancel" })).toBeInViewport();
  await expect(group.getByRole("button", { name: "Delete", exact: true })).toBeInViewport();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});
