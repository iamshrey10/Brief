import { expect, test } from "@playwright/test";

import { resetFakeApi, signInAsTestReader } from "./support/session";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
});

test("the Profile section shows who is signed in and where they stand against today's limits", async ({ page }) => {
  const email = await signInAsTestReader(page);
  await page.goto("/dashboard");

  await page.getByRole("navigation", { name: "Sections" }).first().getByRole("link", { name: "Profile" }).click();

  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Account" }).getByText(email)).toBeVisible();
  const limits = page.getByRole("region", { name: "Today's limits" });
  await expect(limits.getByRole("progressbar")).toHaveCount(3);
  await expect(limits.getByText(/\d+ of \d+ used/)).toHaveCount(3);
  await expect(page).toHaveTitle("Profile | Brief");
});

test("the sections link to each other, and each marks itself as the current one", async ({ page }) => {
  await signInAsTestReader(page);
  await page.goto("/dashboard/profile");
  const sections = page.getByRole("navigation", { name: "Sections" }).first();

  await expect(sections.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  await expect(sections.getByRole("link", { name: "Documents" })).not.toHaveAttribute("aria-current", "page");

  await sections.getByRole("link", { name: "Documents" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your contracts" })).toBeVisible();
  await expect(sections.getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page");
});

test("a limit that is used up says so in words as well as by color", async ({ page }) => {
  await signInAsTestReader(page, "no-quota");
  await page.goto("/dashboard/profile");

  await expect(page.getByRole("region", { name: "Today's limits" }).getByText("None left today")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Questions used today" })).toHaveAttribute("aria-valuenow", "100");
});

test("account deletion is in its own Danger zone and is not on the dashboard", async ({ page }) => {
  await signInAsTestReader(page);
  await page.goto("/dashboard/profile");

  await expect(page.getByRole("region", { name: "Danger zone" }).getByRole("button", { name: "Delete my account" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
});

test("the dashboard says how many documents there are and how many of each kind", async ({ page }) => {
  await signInAsTestReader(page);
  await page.goto("/dashboard");

  const summary = page.getByRole("group", { name: "Your documents at a glance" });
  await expect(summary.getByText("2 documents")).toBeVisible();
  await expect(summary.getByText(/Lease\s*1/)).toBeVisible();
});

test("choosing Dark on the Profile page turns the site dark and is kept after a reload", async ({ page }) => {
  await signInAsTestReader(page);
  await page.goto("/dashboard/profile");

  await page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
});

test("the dashboard counts down to a clear date and leaves out a loose phrase", async ({ page }) => {
  await signInAsTestReader(page);
  await page.goto("/dashboard");

  const comingUp = page.getByRole("region", { name: "Coming up" });
  await expect(comingUp.getByRole("link", { name: /Lease ends in \d+ days/ })).toBeVisible();
  await expect(comingUp.getByRole("link", { name: /sample-lease\.pdf/ })).toHaveAttribute("href", "/dashboard/documents/doc-lease");
  // The loan's "six months after graduation" is not a date, so it is not counted down to.
  await expect(comingUp.getByText(/Repayments/)).toHaveCount(0);
});
