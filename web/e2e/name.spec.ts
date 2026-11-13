import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { resetFakeApi, seedNoName, seedSharedDashboard, signInAsTestReader } from "./support/session";

let reader = "";

test.beforeEach(async ({ page }) => {
  await resetFakeApi(page);
  reader = await signInAsTestReader(page);
});

test("a first visit asks for a first and last name before anything else, then lands on the Dashboard", async ({ page }) => {
  await seedNoName(page);

  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/dashboard\/welcome$/);
  await expect(page.getByRole("heading", { name: "Welcome to Brief", level: 1 })).toBeVisible();
  await page.getByLabel("First name").fill("Maya");
  await page.getByLabel("Last name").fill("Rao");
  await page.getByRole("button", { name: "Continue" }).click();

  // To the dashboard, where the tour opens. Skipping it leaves the dashboard.
  await expect(page).toHaveURL(/\/dashboard\?tour=1$/);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/welcome");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a name with digits is refused with a reason, and nothing is saved", async ({ page }) => {
  await seedNoName(page);
  await page.goto("/dashboard/welcome");

  await page.getByLabel("First name").fill("M4ya");
  await page.getByLabel("Last name").fill("Rao");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("p[role=alert]")).toContainText("Use letters");
  await expect(page).toHaveURL(/\/dashboard\/welcome$/);
});

test("the name shows in Profile and can be changed there", async ({ page }) => {
  await page.goto("/dashboard/profile");

  const account = page.getByRole("region", { name: "Account" });
  await expect(account).toContainText("Test Reader");
  await expect(account).toContainText(reader);
  await account.getByRole("button", { name: "Edit name" }).click();
  await page.getByLabel("First name").fill("Mia");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(account).toContainText("Mia Reader");
  await page.reload();
  await expect(page.getByRole("region", { name: "Account" })).toContainText("Mia Reader");
});

test("someone looking at a shared dashboard sees the owner's name, with the address beneath", async ({ page }) => {
  await seedSharedDashboard(page, {
    id: "shared-1",
    owner_email: "mum@example.com",
    owner_name: "Maya Rao",
    status: "active",
    dashboard: { owner_email: "mum@example.com", owner_name: "Maya Rao", documents: [], insights: [], key_dates: [] },
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "View dashboard" }).locator("xpath=..")).toContainText("Maya Rao");

  await page.getByRole("link", { name: "View dashboard" }).click();

  const note = page.getByRole("note");
  await expect(note).toContainText("Maya Rao");
  await expect(note).toContainText("mum@example.com");
});

for (const scheme of ["light", "dark"] as const) {
  test(`the welcome page has no accessibility violations in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seedNoName(page);
    await page.goto("/dashboard/welcome");
    await page.waitForTimeout(500);

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
