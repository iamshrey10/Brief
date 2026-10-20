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
  await page.goto("/dashboard");
  await expect(page.getByText("sample-lease.pdf")).toBeVisible();

  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  const name = await page.getByText("sample-lease.pdf").boundingBox();
  expect(name!.x).toBeGreaterThanOrEqual(0);
  expect(name!.x + name!.width).toBeLessThanOrEqual(390);
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
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Delete sample-lease.pdf" }).click();

  const group = page.getByRole("group", { name: "Delete sample-lease.pdf" });
  await expect(group.getByRole("button", { name: "Cancel" })).toBeInViewport();
  await expect(group.getByRole("button", { name: "Delete", exact: true })).toBeInViewport();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});
